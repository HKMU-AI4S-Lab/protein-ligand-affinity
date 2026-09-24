import torch
from torch.utils.data import Dataset
import numpy as np
import os
from openbabel import pybel

CHARISOSMISET = {"#": 29, "%": 30, ")": 31, "(": 1, "+": 32, "-": 33, "/": 34, ".": 2,
                 "1": 35, "0": 3, "3": 36, "2": 4, "5": 37, "4": 5, "7": 38, "6": 6,
                 "9": 39, "8": 7, "=": 40, "A": 41, "@": 8, "C": 42, "B": 9, "E": 43,
                 "D": 10, "G": 44, "F": 11, "I": 45, "H": 12, "K": 46, "M": 47, "L": 13,
                 "O": 48, "N": 14, "P": 15, "S": 49, "R": 16, "U": 50, "T": 17, "W": 51,
                 "V": 18, "Y": 52, "[": 53, "Z": 19, "]": 54, "\\": 20, "a": 55, "c": 56,
                 "b": 21, "e": 57, "d": 22, "g": 58, "f": 23, "i": 59, "h": 24, "m": 60,
                 "l": 25, "o": 61, "n": 26, "s": 62, "r": 27, "u": 63, "t": 28, "y": 64}

CHARISOSMILEN = 64

CHARPROTSET = {"A": 1, "C": 2, "B": 3, "E": 4, "D": 5, "G": 6,
               "F": 7, "I": 8, "H": 9, "K": 10, "M": 11, "L": 12,
               "O": 13, "N": 14, "Q": 15, "P": 16, "S": 17, "R": 18,
               "U": 19, "T": 20, "W": 21, "V": 22, "Y": 23, "X": 24, "Z": 25}

CHARPROTLEN = 25

vox_path = '/home/dwanghkmu/kerongji/code/MCANet_Ablation/DataSets/DUDE_Drug_VOX'


class Feature_extractor():
    def __init__(self):
        self.atom_codes = {}
        others = ([3,4,5,11,12,13,14]+list(range(19,32))+list(range(37,51))+list(range(55,84)))
        atom_types = [1,(6,1),(6,2),(6,3),(7,1),(7,2),(7,3),8,15,(16,2),(16,3),34,[9,17,35,53],others]
      
        for i, j in enumerate(atom_types):
            if type(j) is list:
                for k in j:
                    self.atom_codes[k] = i
                
            else:
                self.atom_codes[j] = i              
        
        self.sum_atom_types = len(atom_types)
        
    #Onehot encoding of each atomic type
    def encode(self, atomic_num, molprotein):
        encoding = np.zeros(self.sum_atom_types*2)
        if molprotein == 1:
            encoding[self.atom_codes[atomic_num]] = 1.0
        else:
            encoding[self.sum_atom_types+self.atom_codes[atomic_num]] = 1.0
        
        return encoding
    
    #Get coords and features 
    def get_features(self, molecule, molprotein):
        coords = []
        features = []
            
        for atom in molecule:
            coords.append(atom.coords)
            if atom.atomicnum in [6,7,16]:
                atomicnum = (atom.atomicnum,atom.hyb)
                features.append(self.encode(atomicnum,molprotein))
            else:
                features.append(self.encode(atom.atomicnum,molprotein))
        
        coords = np.array(coords, dtype=np.float32)
        features = np.array(features, dtype=np.float32)
        
        return coords, features  

    #Generate 4D tensor
    def grid(self,coords, features):
        assert coords.shape[1] == 3
        assert coords.shape[0] == features.shape[0]  
        
        grid=np.zeros((features.shape[1],24,24,24),dtype=np.float32)
        x=y=z=np.array(range(-10,10),dtype=np.float32)+0.5
        for i in range(len(coords)):
            coord=coords[i]
            tmpx=abs(coord[0]-x)
            tmpy=abs(coord[1]-y)
            tmpz=abs(coord[2]-z)
            if np.max(tmpx)<=19.5 and np.max(tmpy)<=19.5 and np.max(tmpz) <=19.5:
                grid[:, np.argmin(tmpx),np.argmin(tmpy),np.argmin(tmpz)] += features[i]                
        return grid


# In[13]:
def get_grid(ligand):
    Feature = Feature_extractor()
    coords2, features2 = Feature.get_features(ligand,0)
    center=(np.max(coords2,axis=0)+np.min(coords2,axis=0))/2
    coords2 = coords2-center
    grid=Feature.grid(coords2,features2)
    
    return grid

def smiles2grid(smiles):
    mol = pybel.readstring("smi", smiles)
    mol.addh()
    mol.make3D()
    grid = get_grid(mol)
    return grid

def label_smiles(line, smi_ch_ind, MAX_SMI_LEN=100):
    X = np.zeros(MAX_SMI_LEN, dtype=np.int64())
    for i, ch in enumerate(line[:MAX_SMI_LEN]):
        X[i] = smi_ch_ind.get(ch, 0)
    return X


def label_sequence(line, smi_ch_ind, MAX_SEQ_LEN=1000):
    X = np.zeros(MAX_SEQ_LEN, np.int64())
    for i, ch in enumerate(line[:MAX_SEQ_LEN]):
        X[i] = smi_ch_ind.get(ch, 0)
    return X


def get_voxel_from_file(file_path, vox_path):
    file_path = file_path.replace('.ply', '.npy')
    grid_file = os.path.join(vox_path, file_path)
    voxel_array = np.load(grid_file)
    return voxel_array

# class CustomDataSet(Dataset):
#     def __init__(self, pairs, grid_dict):
#         self.pairs = pairs
#         self.grid_dict = grid_dict

#     def __getitem__(self, item):
#         pairs = self.pairs[item]
#         pair = pairs.strip().split()
#         compoundgrid, compoundstr, proteinstr, label = pair[-4], pair[-3], pair[-2], pair[-1]
#         compoundgrid = compoundgrid.split('.')[0]
#         grid = self.grid_dict[compoundgrid]
#         return pairs, grid

#     def __len__(self):
#         return len(self.pairs)

class CustomDataSet(Dataset):
    def __init__(self, pairs):
        self.pairs = pairs

    def __getitem__(self, item):
        return self.pairs[item]

    def __len__(self):
        return len(self.pairs)

def collate_fn(batch_data):
    N = len(batch_data)
    compound_max = 100
    protein_max = 1000
    compound_new = torch.zeros((N, compound_max), dtype=torch.long)
    protein_new = torch.zeros((N, protein_max), dtype=torch.long)
    labels_new = torch.zeros(N, dtype=torch.long)
    for i, pair in enumerate(batch_data):
        pair = pair.strip().split()
        compoundstr, proteinstr, label = pair[-3], pair[-2], pair[-1]
        compoundint = torch.from_numpy(label_smiles(
            compoundstr, CHARISOSMISET, compound_max))
        compound_new[i] = compoundint
        proteinint = torch.from_numpy(label_sequence(
            proteinstr, CHARPROTSET, protein_max))
        protein_new[i] = proteinint
        label = float(label)
        labels_new[i] = np.int32(label)
    return (compound_new, protein_new, labels_new)

def collate_fn_drugSmiGrid_proSeq(batch_data):
    N = len(batch_data)
    compound_max = 100
    protein_max = 1000
    voxel_max = 24
    compound_new = torch.zeros((N, compound_max), dtype=torch.long)
    compoundgrid_new = torch.zeros((N, 28, voxel_max, voxel_max, voxel_max), dtype=torch.float)
    protein_new = torch.zeros((N, protein_max), dtype=torch.long)
    labels_new = torch.zeros(N, dtype=torch.long)
    for i, pair in enumerate(batch_data):
        # pair, grid = pair_grid
        pair = pair.strip().split()
        compoundgrid, compoundstr, proteinstr, label = pair[-4], pair[-3], pair[-2], pair[-1]
        compoundvoxel = torch.from_numpy(smiles2grid(compoundstr))
        compoundgrid_new[i] = compoundvoxel
        compoundint = torch.from_numpy(label_smiles(
            compoundstr, CHARISOSMISET, compound_max))
        compound_new[i] = compoundint
        proteinint = torch.from_numpy(label_sequence(
            proteinstr, CHARPROTSET, protein_max))
        protein_new[i] = proteinint
        label = float(label)
        labels_new[i] = np.int32(label)
    return (compoundgrid_new, compound_new, protein_new, labels_new)

