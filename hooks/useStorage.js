// /hooks/useStorage.js
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { useState } from "react";
import { getFirebaseApp } from "../utils/firebase";

export function useStorage() {
  const [uploading, setUploading] = useState(false);
  const [url, setUrl] = useState(null);

  const getStorageInstance = () => {
    const app = getFirebaseApp();
    if (!app) {
      throw new Error('Firebase app not initialized - check environment variables');
    }
    return getStorage(app);
  };

  const uploadFile = async (file, path) => {
    setUploading(true);
    try {
      const storage = getStorageInstance();
      const fileRef = ref(storage, path);
      await uploadBytes(fileRef, file);
      const downloadUrl = await getDownloadURL(fileRef);
      setUrl(downloadUrl);
      return downloadUrl;
    } finally {
      setUploading(false);
    }
  };

  const deleteFile = async (fileUrl) => {
    try {
      const storage = getStorageInstance();
      const fileRef = ref(storage, fileUrl);
      await deleteObject(fileRef);
      return true;
    } catch (error) {
      console.error("Error deleting file:", error);
      return false;
    }
  };

  return { uploading, url, uploadFile, deleteFile };
}
