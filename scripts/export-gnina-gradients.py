"""Export exact FP32 CNNaffinity derivatives and validate against native autograd.

The backward graph applies the chain rule to the unchanged original forward
layers: transpose convolution, ReLU derivative (zero at zero), and 2x2x2 average
pooling transpose. It is not a trained replacement or a finite difference model.
"""
import importlib.util
import json
from pathlib import Path
import time
import numpy as np
import onnx
import onnxruntime as ort
import torch
from torch import nn
import torch.nn.functional as F

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('exporter', ROOT/'scripts/export-research-models.py')
ex = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ex)
DIMS = (1, 28, 48, 48, 48)


class AffinityDerivatives(nn.Module):
    def __init__(self, native):
        super().__init__()
        self.model = native.model

    def forward(self, grid):
        x = grid
        layers = list(self.model.features.children())
        activations = []
        for layer in layers:
            x = layer(x)
            activations.append(x)
        spatial = x
        flat = x.reshape(1, -1)
        affinity = self.model.affinity(flat)
        pose = self.model.pose(flat).softmax(dim=1)
        # Affinity head is a single linear layer; its spatial derivative is W.
        gradient = self.model.affinity.affinity_output.weight.reshape(1, 128, 6, 6, 6)
        cam = torch.relu((gradient.mean((2, 3, 4), keepdim=True) * spatial).sum(1))
        for layer, activation in reversed(list(zip(layers, activations))):
            if isinstance(layer, nn.ReLU):
                gradient = gradient * (activation > 0).to(torch.float32)
            elif isinstance(layer, nn.Conv3d):
                gradient = F.conv_transpose3d(gradient, layer.weight, stride=layer.stride,
                                              padding=layer.padding, dilation=layer.dilation,
                                              groups=layer.groups)
            elif isinstance(layer, nn.AvgPool3d):
                # All source pools have kernel=stride=2, no padding. Every
                # upstream gradient is distributed equally to its eight inputs.
                gradient = F.interpolate(gradient, scale_factor=2, mode='nearest') / 8
            else:
                raise TypeError(f'Unvalidated derivative layer: {layer}')
        return pose, affinity, gradient, cam, spatial


def native_outputs(model, grid):
    x = grid.detach().clone().requires_grad_()
    captured = []
    hook = model.model.features.register_forward_hook(lambda m, i, o: captured.append(o))
    try:
        pose, affinity = model(x)
        spatial = captured[-1]
        grad, spatial_grad = torch.autograd.grad(affinity.sum(), (x, spatial))
        cam = torch.relu((spatial_grad.mean((2, 3, 4), keepdim=True)*spatial).sum(1))
        return [t.detach().numpy() for t in (pose, affinity, grad, cam, spatial)]
    finally:
        hook.remove()


def integrate_native(model, grid, steps=128):
    """Reference independent autograd trapezoid integral, also retaining 64 steps."""
    total = torch.zeros_like(grid, dtype=torch.float64)
    coarse = torch.zeros_like(total)
    for i in range(steps+1):
        x = (grid*(i/steps)).detach().requires_grad_()
        gradient = torch.autograd.grad(model(x)[1].sum(), x)[0].detach().to(torch.float64)
        weight = .5 if i in (0, steps) else 1
        total += gradient*weight
        if i % 2 == 0:
            coarse += gradient*weight
    return [(grid*t/n).sum(1)[0].numpy().astype('<f4')
            for t, n in [(coarse, steps//2), (total, steps)]]


def main():
    torch.set_num_threads(2)
    torch.manual_seed(1729)
    native, checkpoint = ex.load_gnina()
    model = AffinityDerivatives(native).eval()
    out = ROOT/'public/research/gnina-crossdock'
    refs = ROOT/'artifacts/gnina-gradient-references'
    refs.mkdir(parents=True, exist_ok=True)
    dest = out/'gradients.onnx'
    names = ['pose_scores', 'affinity', 'input_gradient', 'grad_cam', 'spatial_activation']
    zero = torch.zeros(DIMS)
    torch.onnx.export(model, (zero,), str(dest), input_names=['grid'], output_names=names,
                      opset_version=17, dynamo=False)
    onnx.checker.check_model(str(dest))
    session = ort.InferenceSession(str(dest), providers=['CPUExecutionProvider'])
    manifest = json.loads((out/'manifest.json').read_text(encoding='utf-8'))
    manifest.update(artifact=ex.artifact(dest), examples=[], validation={'status': 'pending'})
    shapes = [[1, 2], [1, 1], list(DIMS), [1, 6, 6, 6], [1, 128, 6, 6, 6]]
    manifest['outputs'] = [dict(name=n, dtype='float32', shape=s) for n, s in zip(names, shapes)]
    (out/'gradients-manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    report = dict(checkpointSha256=ex.digest(checkpoint), modelSha256=ex.digest(dest),
                  bytes=dest.stat().st_size, torch=torch.__version__, onnxruntime=ort.__version__,
                  target='CNNaffinity', derivative='Exact analytic chain rule, native autograd reference',
                  operators=sorted({node.op_type for node in onnx.load(dest).graph.node}), cases=[])
    cases = [('zero', zero), ('deterministic-random', torch.rand(DIMS)*.25)]
    for name in ['1hsg', '1hvr']:
        cases.append((name, torch.from_numpy(np.fromfile(out/(name+'-grid.bin'), dtype='<f4').reshape(DIMS))))
    for name, grid in cases:
        expected = native_outputs(native, grid)
        with torch.no_grad():
            analytic = [t.numpy() for t in model(grid)]
        actual = session.run(None, {'grid': grid.numpy()})
        analytic_errors = {n: float(np.max(np.abs(a-b))) for n, a, b in zip(names, analytic, expected)}
        errors = {n: float(np.max(np.abs(a-b))) for n, a, b in zip(names, actual, expected)}
        # The native analytical gradient must agree tightly before ONNX/browser.
        for field in ['input_gradient', 'grad_cam', 'spatial_activation']:
            if analytic_errors[field] > 1e-6:
                raise AssertionError((name, field, 'analytic/native mismatch', analytic_errors[field]))
        if errors['input_gradient'] > 1e-4 or errors['grad_cam'] > 1e-5 or errors['affinity'] > .01:
            raise AssertionError((name, errors))
        entry = dict(id=name, analyticAutogradMaxErrors=analytic_errors, onnxAutogradMaxErrors=errors)
        if name in ('1hsg', '1hvr'):
            entry['references'] = {}
            for n, values in zip(names, expected):
                path = refs/(name+'-'+n+'.bin')
                values.astype('<f4').tofile(path)
                entry['references'][n] = dict(path=path.relative_to(ROOT).as_posix(), bytes=path.stat().st_size, sha256=ex.digest(path))
            started = time.perf_counter()
            ig64, ig128 = integrate_native(native, grid)
            baseline = float(native(zero)[1].item())
            delta = float(expected[1].item())-baseline
            entry.update(baselineScore=baseline, outputDifference=delta,
                         nativeIGSeconds=time.perf_counter()-started, integratedGradients={})
            for steps, ig in [(64, ig64), (128, ig128)]:
                path = refs/(name+f'-ig{steps}.bin')
                ig.tofile(path)
                entry['integratedGradients'][str(steps)] = dict(path=path.relative_to(ROOT).as_posix(),
                    bytes=path.stat().st_size, sha256=ex.digest(path), attributionSum=float(ig.astype(np.float64).sum()),
                    completenessResidual=float(ig.astype(np.float64).sum()-delta))
        report['cases'].append(entry)
        print(name, errors, flush=True)
    (ROOT/'artifacts/gnina-gradients-export.json').write_text(json.dumps(report, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
