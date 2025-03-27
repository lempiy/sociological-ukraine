import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';

import { routes } from './app.routes';

// Firebase
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getFunctions, provideFunctions } from '@angular/fire/functions';

// Nebular
import { NbThemeModule, NbLayoutModule, NbButtonModule, NbAlertModule } from '@nebular/theme';
import { NbEvaIconsModule } from '@nebular/eva-icons';
const fireConfig = { projectId: "sociology-ukraine", appId: "1:641142773910:web:8f13ed9be3fff9feb08ab7", storageBucket: "sociology-ukraine.firebasestorage.app", apiKey: "AIzaSyBRLoNDOQl1-yYB0IZHU09-EzL0bnuTDYQ", authDomain: "sociology-ukraine.firebaseapp.com", messagingSenderId: "641142773910" }

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideAnimations(),
    // Firebase
    provideFirebaseApp(() => initializeApp(fireConfig)),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
    provideFunctions(() => getFunctions(initializeApp(fireConfig), "europe-central2")),
    importProvidersFrom(
      // Nebular
      NbThemeModule.forRoot({ name: 'default' }),
      NbLayoutModule,
      NbEvaIconsModule,
      NbButtonModule,
      NbAlertModule
    )
  ]
};
