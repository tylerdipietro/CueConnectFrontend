import { FirebaseAuthTypes } from '@react-native-firebase/auth';

// Define a more robust User type that includes the Firebase user object
export interface User {
  firebaseAuthUser: FirebaseAuthTypes.User; // The actual Firebase user object
  isAdmin: boolean;
  tokenBalance: number;
  stripeCustomerId?: string; // Optional, as it might not be present immediately
}

// Define the Table interface
export interface Table {
  _id: string;
  venueId: string | { _id: string; name: string; /* other venue properties */ }; // Can be string or populated object
  tableNumber: string | number;
  esp32DeviceId?: string;
  status: 'available' | 'occupied' | 'queued' | 'in_play' | 'awaiting_confirmation' | 'maintenance' | 'out_of_order';
  currentPlayers: {
    player1Id: string | null;
    player2Id: string | null;
  };
  currentSessionId?: string;
  queue: { displayName: string; _id: string }[]; // Simplified for frontend display
  perGameCost: number;
  player1Details?: { _id: string; displayName: string };
  player2Details?: { _id: string; displayName: string };
  // Admin-specific fields that might be returned for tables
  hourlyRate?: number; // Added for admin dashboard
}

// Define the Venue interface
export interface Venue {
  _id: string;
  name: string;
  address: string;
  location?: {
    type: string;
    coordinates: number[]; // [longitude, latitude]
  };
  latitude?: number; // Added for convenience in forms
  longitude?: number; // Added for convenience in forms
  ownerId?: string;
  numberOfTables?: number;
  perGameCost?: number;
  tableIds?: string[]; // Array of Table ObjectIds
  tables?: Table[]; // <--- NEW: Array of populated Table objects for admin dashboard
  createdAt?: string;
  updatedAt?: string;
  __v?: number;
}

// Define the RootStackParamList for React Navigation
export type RootStackParamList = {
  Welcome: undefined;
  SignUp: undefined;
  Login: undefined;
  Home: undefined;
  VenueDetail: { venueId: string; venueName: string };
  AdminDashboard: undefined; // No params needed for AdminDashboard directly
  UserProfile: undefined;
  TokenScreen: { user: { uid: string; tokenBalance: number } };
  PayForTable: {
    tableId: string;
    tableNumber: string | number;
    venueId: string;
    venueName: string;
    perGameCost: number;
    esp32DeviceId?: string;
    currentUserTokenBalance: number;
  };
};
