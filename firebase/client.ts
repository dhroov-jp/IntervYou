// Import the functions you need from the SDKs you need
import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCh9wFly_pYlIcpTGN6JDinyd74f4ymdKs",
  authDomain: "intervyou-3bfdd.firebaseapp.com",
  projectId: "intervyou-3bfdd",
  storageBucket: "intervyou-3bfdd.firebasestorage.app",
  messagingSenderId: "517793477575",
  appId: "1:517793477575:web:147f229f6c545d9a615fe2",
  measurementId: "G-WG50FKHTX0"
};

// Initialize Firebase
const app = !getApps.length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
