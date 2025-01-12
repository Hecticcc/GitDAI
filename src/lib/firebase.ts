import { initializeApp } from '@firebase/app';
import { getAnalytics } from '@firebase/analytics';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User
} from '@firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc,
  collection,
  query,
  where,
  getDocs
} from '@firebase/firestore';
import { debugLogger } from './debug';

const firebaseConfig = {
  apiKey: "AIzaSyBqOIFr0on6vYp4r-bBKaeSFm9YJVHypEs",
  authDomain: "discordai-18215.firebaseapp.com",
  projectId: "discordai-18215",
  storageBucket: "discordai-18215.firebasestorage.app",
  messagingSenderId: "179132802157",
  appId: "1:179132802157:web:b5b40fd2bfa178a00acb64",
  measurementId: "G-TF8FNRB377"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

interface UserData {
  email: string;
  username: string;
  name: string;
  pterodactylId: string;
  lastLogin?: Date;
  createdAt: Date;
  dob: string;
  servers: string[];
  id: string;
  tokens: number;
}

export async function createPterodactylUser(email: string, password: string, username: string, firstName: string, lastName: string) {
  const requestId = crypto.randomUUID();
  debugLogger.startRequest(requestId);

  try {
    debugLogger.info('Creating Pterodactyl User', {
      email,
      username
    }, 'pterodactyl', { requestId });

    const response = await fetch('/.netlify/functions/create-pterodactyl-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        username,
        firstName,
        lastName
      })
    });

    debugLogger.info('Raw Response', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers)
    }, 'pterodactyl', {
      requestId
    });

    if (!response.ok) {
      const error = await response.json();
      debugLogger.error('API Error', error, 'pterodactyl', { requestId });
      throw new Error(error.error || 'Failed to create Pterodactyl user');
    }

    const data = await response.json();
    debugLogger.info('Success Response', data, 'pterodactyl', { requestId });

    if (!data.attributes?.id) {
      debugLogger.error('Missing ID', data, 'pterodactyl', { requestId });
      throw new Error('Failed to create Pterodactyl user');
    }

    return data.attributes.id;
  } catch (error) {
    debugLogger.error('Fatal Error', {
      message: error.message,
      stack: error.stack
    }, 'pterodactyl', { requestId });
    throw error;
  } finally {
    debugLogger.endRequest(requestId);
  }
}

export async function registerUser(email: string, password: string, username: string, dob: string) {
  try {
    // Create Firebase user
    let userCredential;
    try {
      userCredential = await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
      if (error.code === 'auth/email-already-in-use') {
        throw new Error('Email is already registered');
      }
      throw error;
    }
    
    // Create Pterodactyl user
    let pterodactylId;
    try {
      pterodactylId = await createPterodactylUser(email, password, username, 'DiscordAI', 'Bot');
    } catch (error) {
      // If Pterodactyl user creation fails, delete the Firebase user
      await userCredential.user.delete();
      throw new Error(`Failed to create Pterodactyl account: ${error.message}`);
    }
    
    // Store additional user data in Firestore
    const userData: UserData = {
      id: userCredential.user.uid,
      email: email,
      username: username,
      name: username,
      pterodactylId: pterodactylId,
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      dob: dob,
      servers: [],
      tokens: 500, // Give 500 tokens on registration
      firstName: firstName,
      lastName: lastName
    };
    
    try {
      await setDoc(doc(db, 'users', userCredential.user.uid), userData);
      
      // Also create a reference by pterodactyl ID for easy lookup
      await setDoc(doc(db, 'pterodactyl_users', pterodactylId), {
        userId: userCredential.user.uid,
        email,
        username,
        firstName: 'DiscordAI',
        lastName: 'Bot'
      });

    } catch (error) {
      // If Firestore save fails, clean up
      await userCredential.user.delete();
      throw new Error(`Failed to save user data: ${error.message}`);
    }
    
    return userCredential.user;
  } catch (error) {
    console.error('Error during registration:', error);
    throw error;
  }
}

export async function loginUser(email: string, password: string, rememberMe: boolean = false) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    
    // Update last login
    await setDoc(doc(db, 'users', userCredential.user.uid), {
      lastLogin: new Date()
    }, { merge: true });
    
    if (rememberMe) {
      // Set persistent login
      localStorage.setItem('rememberMe', 'true');
      localStorage.setItem('userEmail', email);
    } else {
      // Clear persistent login
      localStorage.removeItem('rememberMe');
      localStorage.removeItem('userEmail');
    }
    
    return userCredential.user;
  } catch (error) {
    console.error('Error during login:', error);
    throw error;
  }
}

export async function logoutUser() {
  try {
    await signOut(auth);
    localStorage.removeItem('rememberMe');
    localStorage.removeItem('userEmail');
  } catch (error) {
    console.error('Error during logout:', error);
    throw error;
  }
}

export function useAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export async function getUserData(userId: string): Promise<UserData | null> {
  try {
    const docRef = doc(db, 'users', userId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return docSnap.data() as UserData;
    }
    return null;
  } catch (error) {
    console.error('Error fetching user data:', error);
    throw error;
  }
}

// Check for saved login credentials on startup
export async function checkSavedLogin() {
  const rememberMe = localStorage.getItem('rememberMe');
  const email = localStorage.getItem('userEmail');
  
  if (rememberMe && email) {
    return email;
  }
  return null;
}