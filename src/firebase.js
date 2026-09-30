import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyD7tmeaqcaV__-V4NQfymY3vQUryH83EFA",
  authDomain: "gather-hq.firebaseapp.com",
  projectId: "gather-hq",
  storageBucket: "gather-hq.firebasestorage.app",
  messagingSenderId: "998593979219",
  appId: "1:998593979219:web:51a5a8a1ef214658ec77a6"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
