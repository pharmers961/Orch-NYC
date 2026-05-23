# Security Specification & Threat Model for Marquee Event Aggregator

## 1. Data Invariants
- **Owner Separation**: A user's profile and custom sources list under `/users/{userId}` must belong strictly to the authenticated user where `request.auth.uid == userId`.
- **Private Data Restriction**: Only the authenticated owner can read or write their user profile data. No other authenticated or public user has read or write access.
- **Strict Data Validation**:
  - `userId` must equal the authenticated user's ID.
  - `sources` must be a list (Array) of valid URLs of limited size (e.g., maximum 50 sources to prevent denial of wallet attacks).
  - `updatedAt` must match the server timestamp `request.time`.

---

## 2. The "Dirty Dozen" Payloads (Threat Model)

We define 12 custom malicious / out-of-spec payloads to be tested against our security rules:

1. **Identity Spoofing - Profile Creep**: Authenticated user `attacker_123` attempts to write a UserProfile under `/users/victim_456`.
2. **Unverified Email Hijack**: Authenticated user with `email_verified == false` attempts to write their UserProfile.
3. **Ghost Fields injection**: Authenticated user attempts to write a UserProfile containing unallowed fields such as `isAdmin: true` or `role: "superuser"`.
4. **Oversized String Injection**: Authenticated user attempts to write a source URL with a 10MB malicious buffer to cause denial of wallet.
5. **Privilege Escalation via Mutation**: Authenticated user attempts to mutate their `userId` field to match another user after creation.
6. **Timeline Forgery**: Authenticated user attempts to set `updatedAt` to a future timestamp (e.g. `2030-01-01T00:00:00Z`) instead of the server timestamp.
7. **Type Mismatch Violation**: Authenticated user attempts to upload `sources` as a plain string instead of an Array/List.
8. **Malicious ID Poisoning**: Attacker attempts to write a document with an ID formatted as special chars `/users/!@#$$%^&*()_+` or long paths.
9. **Null Auth Attack**: Anonymous/unauthenticated user attempts to read any profile.
10. **Public Search Read Leak**: Attacker tries to execute a list query on `/users` collection without filtering by their own `userId`.
11. **Excessive List Size Attack**: User attempts to store an array of 5,000 custom web sources in `sources`.
12. **Sub-resource Write Bypass**: Attacker tries to write into a nested, non-defined subcollection `/users/{userId}/shadow_private`.

---

## 3. The Test Runner (firestore.rules.test.ts)

Below is the verification test suite written in TypeScript using `@firebase/rules-unit-testing`:

```typescript
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import * as fs from "fs";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "psyched-osprey-w5xj8",
    firestore: {
      rules: fs.readFileSync("firestore.rules", "utf8"),
      host: "localhost",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe("Firestore Security Rules", () => {
  it("rejects unauthenticated read/write to user profile", async () => {
    const unauthedDb = testEnv.unauthenticatedContext().firestore();
    const req = getDoc(doc(unauthedDb, "users/victim_123"));
    await assertFails(req);
  });

  it("allows owner to write their own profile with correct server timestamp and email_verified", async () => {
    const authedDb = testEnv
      .authenticatedContext("user_123", {
        email: "user_123@example.com",
        email_verified: true,
      })
      .firestore();

    const req = setDoc(doc(authedDb, "users/user_123"), {
      userId: "user_123",
      sources: ["https://example.com/events"],
      updatedAt: serverTimestamp(),
    });
    await assertSucceeds(req);
  });

  it("rejects write if email is not verified", async () => {
    const authedDb = testEnv
      .authenticatedContext("user_123", {
        email: "user_123@example.com",
        email_verified: false,
      })
      .firestore();

    const req = setDoc(doc(authedDb, "users/user_123"), {
      userId: "user_123",
      sources: ["https://example.com/events"],
      updatedAt: serverTimestamp(),
    });
    await assertFails(req);
  });

  it("rejects writing to another user's profile", async () => {
    const attackerDb = testEnv
      .authenticatedContext("attacker_456", {
        email: "attacker@example.com",
        email_verified: true,
      })
      .firestore();

    const req = setDoc(doc(attackerDb, "users/user_123"), {
      userId: "user_123",
      sources: ["https://example.com/events"],
      updatedAt: serverTimestamp(),
    });
    await assertFails(req);
  });

  it("rejects writing if payload has rogue extra fields", async () => {
    const authedDb = testEnv
      .authenticatedContext("user_123", {
        email: "user_123@example.com",
        email_verified: true,
      })
      .firestore();

    const req = setDoc(doc(authedDb, "users/user_123"), {
      userId: "user_123",
      sources: ["https://example.com/events"],
      updatedAt: serverTimestamp(),
      isAdmin: true, // Ghost field
    });
    await assertFails(req);
  });
});
```
