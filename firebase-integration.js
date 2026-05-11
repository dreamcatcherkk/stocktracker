// =============================================================================
// firebase-integration.js
// Drop this file into your repo and load it in index.html BEFORE your main JS.
// It replaces localStorage with Firestore and adds Google Sign-In.
//
// SETUP: Fill in your Firebase config below (from the Firebase console).
// =============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// -----------------------------------------------------------------------------
// 1. YOUR FIREBASE CONFIG â€” replace with values from Firebase Console
// -----------------------------------------------------------------------------
// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCAL3_ct9JCeasfD4RYEwiOvqGVs-NN53g",
  authDomain: "portfoliotracker-6250e.firebaseapp.com",
  projectId: "portfoliotracker-6250e",
  storageBucket: "portfoliotracker-6250e.firebasestorage.app",
  messagingSenderId: "341928612090",
  appId: "1:341928612090:web:26334a15e7ed7ce6f5b943"
};

// -----------------------------------------------------------------------------
// 2. INITIALISE FIREBASE
// -----------------------------------------------------------------------------
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// Make auth + db available globally so your existing app.js can use them
window.firebaseAuth = auth;
window.firebaseDb = db;

// -----------------------------------------------------------------------------
// 3. AUTH HELPERS â€” call these from your UI
// -----------------------------------------------------------------------------

/** Sign in with Google popup */
export async function signInWithGoogle() {
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.error("Sign-in error:", err);
  }
}

/** Sign out */
export async function signOutUser() {
  await signOut(auth);
}

/**
 * Listen for auth state changes.
 * Calls onSignedIn(user) or onSignedOut() as appropriate.
 */
export function listenAuth(onSignedIn, onSignedOut) {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      onSignedIn(user);
    } else {
      onSignedOut();
    }
  });
}

// -----------------------------------------------------------------------------
// 4. DATA HELPERS â€” drop-in replacements for your localStorage calls
//
// Your data lives at:
//   users/{uid}/transactions/{txnId}   â€” one doc per transaction
//   users/{uid}/meta/cash              â€” { balance: number }
//   users/{uid}/snapshots/{snapId}     â€” one doc per snapshot
// -----------------------------------------------------------------------------

function uid() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  return user.uid;
}

// ---- Transactions ------------------------------------------------------------

/** Save a new transaction and return its Firestore ID */
export async function addTransaction(txn) {
  // txn shape: { date, type, ticker?, shares?, price?, amount, note, balanceAfter }
  const ref = collection(db, "users", uid(), "transactions");
  const docRef = await addDoc(ref, { ...txn, createdAt: Date.now() });
  return docRef.id;
}

/** Load all transactions, ordered by date ascending */
export async function loadTransactions() {
  const ref = collection(db, "users", uid(), "transactions");
  const q = query(ref, orderBy("date", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Delete a transaction by its Firestore ID */
export async function deleteTransaction(txnId) {
  await deleteDoc(doc(db, "users", uid(), "transactions", txnId));
}

/**
 * Subscribe to real-time transaction updates.
 * Returns an unsubscribe function â€” call it to stop listening.
 *
 * Usage:
 *   const unsub = subscribeTransactions(txns => renderTable(txns));
 */
export function subscribeTransactions(callback) {
  const ref = collection(db, "users", uid(), "transactions");
  const q = query(ref, orderBy("date", "asc"));
  return onSnapshot(q, (snap) => {
    const txns = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(txns);
  });
}

// ---- Cash balance ------------------------------------------------------------

/** Persist the current cash balance */
export async function saveCashBalance(balance) {
  await setDoc(doc(db, "users", uid(), "meta", "cash"), { balance });
}

/** Load the cash balance (returns 0 if none saved yet) */
export async function loadCashBalance() {
  const snap = await getDoc(doc(db, "users", uid(), "meta", "cash"));
  return snap.exists() ? snap.data().balance : 0;
}

// ---- Snapshots --------------------------------------------------------------

/** Save a portfolio snapshot */
export async function addSnapshot(snapshot) {
  // snapshot shape: { date, holdings: [...], cashBalance, totalValue }
  const ref = collection(db, "users", uid(), "snapshots");
  const docRef = await addDoc(ref, { ...snapshot, createdAt: Date.now() });
  return docRef.id;
}

/** Load all snapshots, newest first */
export async function loadSnapshots() {
  const ref = collection(db, "users", uid(), "snapshots");
  const q = query(ref, orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Delete a snapshot */
export async function deleteSnapshot(snapId) {
  await deleteDoc(doc(db, "users", uid(), "snapshots", snapId));
}

// -----------------------------------------------------------------------------
// 5. MIGRATION HELPER
// Reads your existing localStorage data and pushes it to Firestore once.
// Call this once after sign-in if the user has local data.
//
// IMPORTANT: update LOCAL_STORAGE_KEY to match whatever key your app uses.
// -----------------------------------------------------------------------------
const LOCAL_STORAGE_KEY = "ledger"; // <-- check your existing JS and update this

export async function migrateLocalStorageToFirestore() {
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!raw) return; // nothing to migrate

  try {
    const data = JSON.parse(raw);

    // Migrate transactions
    if (Array.isArray(data.transactions)) {
      for (const txn of data.transactions) {
        await addTransaction(txn);
      }
    }

    // Migrate cash balance
    if (typeof data.cashBalance === "number") {
      await saveCashBalance(data.cashBalance);
    }

    // Migrate snapshots
    if (Array.isArray(data.snapshots)) {
      for (const snap of data.snapshots) {
        await addSnapshot(snap);
      }
    }

    // Clear localStorage after successful migration
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    console.log("âœ… Migration to Firestore complete.");
  } catch (err) {
    console.error("Migration failed:", err);
  }
}
