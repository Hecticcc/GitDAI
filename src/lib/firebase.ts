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
  getDocs,
  Timestamp
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
  lastLogin?: Timestamp;
  createdAt: Timestamp;
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

async function checkPterodactylUser(email: string, username?: string): Promise<{emailExists: boolean, usernameExists: boolean}> {
  try {
    const response = await fetch('/.netlify/functions/create-pterodactyl-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email.toLowerCase(),
        username: username?.toLowerCase(),
        checkOnly: true
      })
    });

    const data = await response.json();
    
    return {
      emailExists: !response.ok && (
        response.status === 409 || 
        data.error?.toLowerCase().includes('email already exists') ||
        data.error?.toLowerCase().includes('email is already taken')
      ),
      usernameExists: !response.ok && (
        response.status === 409 ||
        data.error?.toLowerCase().includes('username already exists') ||
        data.error?.toLowerCase().includes('username is already taken')
      )
    };
  } catch (error) {
    console.error('Error checking Pterodactyl user:', error);
    throw new Error('Unable to verify user availability');
  }
}

export async function registerUser(email: string, password: string, username: string, dob: string) {
  try {
    // Validate inputs before making any API calls
    if (!email || !password || !username || !dob) {
      throw new Error('All fields are required');
    }
    
    // Check if email or username exists in Pterodactyl
    const { emailExists, usernameExists } = await checkPterodactylUser(email, username);
    if (emailExists && usernameExists) {
      throw new Error('Both email and username are already taken');
    } else if (emailExists) {
      throw new Error('Email is already registered');
    } else if (usernameExists) {
      throw new Error('Username is already taken');
    }

    // Create Firebase user
    let userCredential;
    try {
      userCredential = await createUserWithEmailAndPassword(auth, email.toLowerCase(), password);
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
      
      if (!pterodactylId) {
        throw new Error('Failed to get Pterodactyl user ID');
      }

      console.log('Pterodactyl user created:', {
        uuid: pterodactylId,
        email,
        username
      });

    } catch (error) {
      // If Pterodactyl user creation fails, delete the Firebase user
      await userCredential.user.delete();
      
      // Check for specific Pterodactyl errors
      if (error.message.includes('email already exists')) {
        throw new Error('Email is already registered');
      } else if (error.message.includes('username already exists')) {
        throw new Error('Username is already taken');
      } else {
        throw new Error(`Failed to create Pterodactyl account: ${error.message}`);
      }
    }
    
    // Store additional user data in Firestore
    const userData: UserData = {
      id: userCredential.user.uid,
      email: email.toLowerCase(),
      username: username.toLowerCase(),
      name: username,
      pterodactylId,
      createdAt: Timestamp.now(),
      lastLogin: Timestamp.now(),
      dob,
      servers: [] as string[],
      tokens: 500 // Give 500 tokens on registration
    };
    
    try {
      // Create user document after authentication
      const userRef = doc(db, 'users', userCredential.user.uid);
      await setDoc(userRef, userData);
      
      // Verify the document was created
      const docSnap = await getDoc(userRef);
      if (!docSnap.exists()) {
        throw new Error('Failed to create user document');
      }
      
      // Also create a reference by pterodactyl ID for easy lookup
      const pterodactylRef = doc(db, 'pterodactyl_users', pterodactylId);
      await setDoc(pterodactylRef, {
        userId: userCredential.user.uid,
        email,
        username,
        createdAt: Timestamp.now()
      });

      // Verify pterodactyl mapping was created
      const pterodactylSnap = await getDoc(pterodactylRef);
      if (!pterodactylSnap.exists()) {
        throw new Error('Failed to create pterodactyl user mapping');
      }

    } catch (error) {
      console.error('Firestore Error:', error);
      // If Firestore save fails, clean up
      await userCredential.user.delete();
      throw new Error(`Failed to save user data: ${error.message}`);
    }
    
    console.log('User registration complete:', {
      uid: userCredential.user.uid,
      email,
      username,
      pterodactylId
    });
    
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
      lastLogin: Timestamp.fromDate(new Date()),
      updatedAt: Timestamp.fromDate(new Date())
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