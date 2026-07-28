import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDOI2Du99T3QzUrkCGCvcKG_hIyWtzLQ0I",
  authDomain: "neuroharmonyclinic.firebaseapp.com",
  projectId: "neuroharmonyclinic",
  storageBucket: "neuroharmonyclinic.firebasestorage.app",
  messagingSenderId: "813913724721",
  appId: "1:813913724721:web:7cf9c8962fc48c87aa0210",
  measurementId: "G-6XBHDSFXRD"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export default app;
