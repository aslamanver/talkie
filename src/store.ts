import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface MeStore {
  caller: string;
  callee: string;
  setCaller: (caller: string) => void;
  setCallee: (callee: string) => void;
}

export const useMe = create(
  persist<MeStore>(
    set => ({
      caller: '',
      callee: '',
      setCaller: (caller: string) => set({ caller }),
      setCallee: (callee: string) => set({ callee }),
    }),
    {
      name: 'me',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
