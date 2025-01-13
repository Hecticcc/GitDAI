import { initializeApp } from '@firebase/app';
import { getAnalytics, isSupported } from '@firebase/analytics';
import { 
  getAuth, 
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
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

// Initialize analytics only if supported
let analytics;
isSupported().then(supported => {
  if (supported) {
    analytics = getAnalytics(app);
  }
}).catch(console.error);

const auth = getAuth(app);
const db = getFirestore(app);

// Default role for new users
const DEFAULT_ROLE = 'user';

export interface UserData {
  email: string;
  username: string;
  name: string;
  pterodactylId: number | string;
  lastLogin?: Timestamp;
  createdAt: Timestamp;
  dob: string;
  servers: string[];
  id: string;
  tokens: number;
  role: string;
  serverStartTime?: number;
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
    // Validate inputs before making any API calls
    if (!email || !password || !username || !dob) {
      throw new Error('All fields are required');
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
      pterodactylId: String(pterodactylId),
      createdAt: Timestamp.now(),
      lastLogin: Timestamp.now(),
      dob,
      servers: [],
      tokens: 500, // Give 500 tokens on registration
      role: DEFAULT_ROLE // Assign default user role
    };
    
    try {
      // Create user document after authentication
      const userRef = doc(db, 'users', userCredential.user.uid);
      await setDoc(userRef, userData);
      
      // Create user role document
      const userRoleRef = doc(db, 'user_roles', `${userCredential.user.uid}_${DEFAULT_ROLE}`);
      await setDoc(userRoleRef, {
        userId: userCredential.user.uid,
        role: DEFAULT_ROLE,
        assignedAt: Timestamp.now(),
        assignedBy: 'system'
      });

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
    
    // Only proceed with updates if we have a valid user
    if (!userCredential?.user?.uid) {
      throw new Error('Failed to authenticate user');
    }

    // Update last login
    await setDoc(doc(db, 'users', userCredential.user.uid), {
      lastLogin: Timestamp.fromDate(new Date()),
      updatedAt: Timestamp.now()
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
    // Provide more specific error messages
    if (error.code === 'auth/invalid-credential') {
      throw new Error('Invalid email or password');
    } else if (error.code === 'auth/user-not-found') {
      throw new Error('No account found with this email');
    } else if (error.code === 'auth/wrong-password') {
      throw new Error('Incorrect password');
    } else if (error.code === 'auth/too-many-requests') {
      throw new Error('Too many failed attempts. Please try again later');
    }
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

export async function updateUserTokens(userId: string, newTokens: number): Promise<void> {
  try {
    if (newTokens < 0) {
      throw new Error('Insufficient tokens');
    }
    
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, {
      tokens: newTokens,
      updatedAt: Timestamp.now()
    }, { merge: true });
  } catch (error) {
    console.error('Error updating user tokens:', error);
    throw error;
  }
}

// Update user's servers list
export async function updateUserServers(userId: string, servers: string[]): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, {
      servers,
      serverStartTime: servers.length > 0 ? Date.now() : null,
      updatedAt: Timestamp.now()
    }, { merge: true });
  } catch (error) {
    console.error('Error updating user servers:', error);
    throw error;
  }
}

// Update user password
export async function updateUserPassword(currentPassword: string, newPassword: string): Promise<void> {
  const auth = getAuth();
  const user = auth.currentUser;
  
  if (!user || !user.email) {
    throw new Error('No authenticated user found');
  }
  
  try {
    // Re-authenticate user before password change
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    
    // Update password
    await updatePassword(user, newPassword);
  } catch (error) {
    console.error('Error updating password:', error);
    
    if (error.code === 'auth/wrong-password') {
      throw new Error('Current password is incorrect');
    } else if (error.code === 'auth/weak-password') {
      throw new Error('New password is too weak');
    } else if (error.code === 'auth/requires-recent-login') {
      throw new Error('Please log in again before changing your password');
    }
    
    throw new Error('Failed to update password');
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