import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { Directory, File, Paths } from 'expo-file-system';
import { isNetworkError } from '@sahyadri/api-client';
import { client } from './api';
import { createQueue, type QueuedStep, type StepFile } from './queue';

const KEY = 'sp.delivery.queue';
let online = true;
NetInfo.addEventListener((s) => {
  online = s.isConnected !== false && s.isInternetReachable !== false;
});

/** Photos for queued steps are copied out of the camera cache, which the system may clear. */
const folder = () => {
  const dir = new Directory(Paths.document, 'pending-proof');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
};

const newId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

export const queue = createQueue({
  store: {
    load: async () => {
      try {
        return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]') as QueuedStep[];
      } catch {
        return [];
      }
    },
    save: (steps) => AsyncStorage.setItem(KEY, JSON.stringify(steps)),
  },
  files: {
    keep: async (f: StepFile) => {
      const target = new File(folder(), `${Date.now()}-${f.name}`);
      new File(f.uri).copy(target);
      return { ...f, uri: target.uri };
    },
    drop: async (f: StepFile) => {
      const file = new File(f.uri);
      if (file.exists) file.delete();
    },
  },
  send: (s) => client.delivery.step({ action: s.action, orderId: s.orderId, clientEventId: s.id, fields: s.fields, files: s.files }),
  isNetworkError,
  online: () => online,
  newId,
});
