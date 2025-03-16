import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getFunctions, provideFunctions } from '@angular/fire/functions';

export const appConfig: ApplicationConfig = {
  providers: [provideZoneChangeDetection({ eventCoalescing: true }), provideRouter(routes), provideFirebaseApp(() => initializeApp({ projectId: "sociology-ukraine", appId: "1:641142773910:web:8f13ed9be3fff9feb08ab7", storageBucket: "sociology-ukraine.firebasestorage.app", apiKey: "AIzaSyBRLoNDOQl1-yYB0IZHU09-EzL0bnuTDYQ", authDomain: "sociology-ukraine.firebaseapp.com", messagingSenderId: "641142773910" })), provideAuth(() => getAuth()), provideFirestore(() => getFirestore()), provideFunctions(() => getFunctions())]
};
