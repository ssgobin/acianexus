/* ================================================================
   NEXUS — Firebase Configuration
   IMPORTANTE: Substitua os valores abaixo pelas credenciais
   do seu projeto Firebase antes de executar.
   Nunca versione este arquivo com chaves reais em repositórios
   públicos. Use variáveis de ambiente ou Firebase Hosting env
   para ambientes de produção.
   ================================================================ */

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

// =================================================================
// SUBSTITUA ESTES VALORES pelas configurações do seu projeto Firebase:
// Firebase Console → Project Settings → Web App → SDK Config
// =================================================================
const firebaseConfig = {
    apiKey: "AIzaSyA4w-vkl0lfoDOoWswvqoFA1I42VYQ71no",
    authDomain: "newacianexus.firebaseapp.com",
    projectId: "newacianexus",
    storageBucket: "newacianexus.firebasestorage.app",
    messagingSenderId: "471819438355",
    appId: "1:471819438355:web:e151da81f6e8a3a1a572e6",
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Habilita persistência offline (melhor UX, mas opcional)
enableIndexedDbPersistence(db).catch(err => {
    if (err.code === 'failed-precondition') {
        // Múltiplas abas abertas — somente uma pode ter persistência
        console.warn('[Nexus] Offline persistence: múltiplas abas detectadas.');
    } else if (err.code === 'unimplemented') {
        console.warn('[Nexus] Offline persistence não suportada neste browser.');
    }
});

export default app;
