import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

const provider = new GoogleAuthProvider();
for (const scope of GMAIL_SCOPES) {
  provider.addScope(scope);
}
provider.setCustomParameters({
  prompt: 'select_account',
});

let isSigningIn = false;
// Keep OAuth access token strictly in memory (never localStorage or sessionStorage)
let cachedAccessToken: string | null = null;

export const initGmailAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthMissing?: (user: User | null) => void
) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user && cachedAccessToken) {
      onAuthSuccess?.(user, cachedAccessToken);
    } else if (!isSigningIn) {
      cachedAccessToken = null;
      onAuthMissing?.(user);
    }
  });
};

async function verifyGmailSendScope(accessToken: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
    );
    if (!res.ok) return true; // Do not block if tokeninfo is unreachable; Gmail API will enforce
    const info = (await res.json()) as { scope?: string };
    if (!info.scope) return true;
    const scopes = info.scope.split(/\s+/);
    return (
      scopes.includes('https://www.googleapis.com/auth/gmail.send') ||
      scopes.includes('https://mail.google.com/') ||
      scopes.includes('https://www.googleapis.com/auth/gmail.compose') ||
      scopes.includes('https://www.googleapis.com/auth/gmail.modify')
    );
  } catch {
    return true;
  }
}

export const signInWithGmail = async (): Promise<{ user: User; accessToken: string }> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Could not obtain Gmail send authorization token. Please try again.');
    }
    const hasSendScope = await verifyGmailSendScope(credential.accessToken);
    if (!hasSendScope) {
      cachedAccessToken = null;
      throw new Error(
        'Gmail send permission was not granted. Please sign in again and check the box to allow "Send email on your behalf".'
      );
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code ?? '';
    if (code === 'auth/popup-blocked') {
      throw new Error(
        'Browser blocked the Google sign-in popup. Please allow popups for this site and try again.'
      );
    }
    if (code === 'auth/popup-closed-by-user') {
      throw new Error('Google sign-in popup was closed before completing authorization.');
    }
    if (code === 'auth/unauthorized-domain') {
      throw new Error(
        `Domain "${window.location.hostname}" is not authorized in Firebase Authentication. Add this domain under Firebase Console -> Authentication -> Settings -> Authorized domains, or use Custom SMTP.`
      );
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getGmailAccessToken = (): string | null => cachedAccessToken;

export const signOutGmail = async (): Promise<void> => {
  await auth.signOut();
  cachedAccessToken = null;
};

export async function sendViaGmailApi(
  accessToken: string,
  rawBase64Url: string
): Promise<{ id: string; threadId: string }> {
  const response = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: rawBase64Url }),
    }
  );

  if (!response.ok) {
    let detail = `Gmail API error (${response.status})`;
    try {
      const errJson = (await response.json()) as { error?: { message?: string } };
      if (errJson.error?.message) {
        detail = errJson.error.message;
      }
    } catch {
      // Ignore JSON parse errors
    }
    if (response.status === 403 && detail.toLowerCase().includes('insufficient')) {
      detail =
        'Missing Gmail send permission (403). Sign out, click "Sign in with Google", and check the "Send email on your behalf" permission box.';
    }
    throw new Error(detail);
  }

  return (await response.json()) as { id: string; threadId: string };
}
