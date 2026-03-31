import admin from "firebase-admin";

const initFirebase = () => {
  if (admin.apps.length > 0) return admin.app();

  // Try to load service account from environment variable
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  
  if (serviceAccountJson) {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      const app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log(`[FirebaseAdmin] Initialized successfully for project: ${serviceAccount.project_id}`);
      return app;
    } catch (e) {
      console.error("[FirebaseAdmin] Failed to parse FIREBASE_SERVICE_ACCOUNT JSON, using default/ADC");
    }
  }

  // Fallback to ADC (Application Default Credentials) if running in GCP 
  // or use the placeholder/manual init if provided in other env vars
  try {
    return admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  } catch (adcError: any) {
    console.error("[FirebaseAdmin] Failed to initialize with Application Default Credentials.");
    console.error("Please provide FIREBASE_SERVICE_ACCOUNT in your .env file.");
    
    // Return a dummy/partially initialized app or throw a clear error
    // For now, let's throw to avoid hanging in downstream calls
    throw new Error("Firebase Admin SDK failed to initialize: No credentials found. Set FIREBASE_SERVICE_ACCOUNT environment variable.");
  }
};

export const firebaseAdmin = initFirebase();
export default firebaseAdmin;
