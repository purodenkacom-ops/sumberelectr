// /hooks/useStorage.js
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { useState } from "react";
import { app } from "../utils/firebase"; // pastikan app Firebase sudah diinisialisasi

export function useStorage() {
  const storage = getStorage(app);
  const [uploading, setUploading] = useState(false);
  const [url, setUrl] = useState(null);

  const uploadFile = async (file, path) => {
    setUploading(true);
    try {
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
      // Create a reference to the file to delete
      // We can use refFromURL or just ref(storage, fileUrl) since Firebase storage supports HTTPS URLs in ref()
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
