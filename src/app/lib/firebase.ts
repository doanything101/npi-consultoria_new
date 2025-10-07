// lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined';

// Only initialize Firebase in the browser with valid config
let app: any;
let auth: any;
let db: any;

if (isBrowser) {
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
  };

  // Only initialize if we have a valid API key
  if (firebaseConfig.apiKey && firebaseConfig.apiKey !== '') {
    try {
      // Inicializa o Firebase apenas uma vez
      app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

      // Inicializa Authentication com persistência local
      auth = getAuth(app);
      setPersistence(auth, browserLocalPersistence).catch((error) => {
        console.error("Erro ao configurar persistência:", error);
      });

      db = getFirestore(app);
    } catch (error) {
      console.error("Erro ao inicializar Firebase:", error);
    }
  } else {
    console.warn("Firebase não inicializado: variáveis de ambiente não configuradas");
  }
}

export { app, auth, db };