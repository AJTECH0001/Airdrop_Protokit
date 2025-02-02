# BUILDING A PRIVATE AIRDROP RUNTIME

This documentation provides a comprehensive explanation of the **Private Airdrop Runtime**. The runtime is built on the [Mina Protocol](https://minaprotocol.com/) using [O1js](https://www.o1labs.org/) and [Protokit](https://protokit.dev/). It demonstrates how to securely manage airdrops by employing **zero-knowledge proofs**, **cryptographic commitments**, and **stateful runtime modules**.

---

## Table of Contents

- [BUILDING A PRIVATE AIRDROP RUNTIME](#building-a-private-airdrop-runtime)
  - [Table of Contents](#table-of-contents)
  - [Introduction](#introduction)
  - [System Overview](#system-overview)
  - [Architecture and Design](#architecture-and-design)
    - [Airdrop Module](#airdrop-module)
    - [Balances Module](#balances-module)
  - [Detailed Code Explanation](#detailed-code-explanation)
    - [Global Declarations and Utility Functions](#global-declarations-and-utility-functions)
  - [Airdrop Module Walkthrough](#airdrop-module-walkthrough)
  - [Balances Module Walkthrough](#balances-module-walkthrough)
  - [Testing Strategy and Examples](#testing-strategy-and-examples)
  - [Key Test Cases Explained](#key-test-cases-explained)
  - [Conclusion and Future Work](#conclusion-and-future-work)
  - [Future Enhancements:](#future-enhancements)
  - [References and Resources](#references-and-resources)

---

## Introduction

The **Private Airdrop Runtime** is designed to securely distribute tokens as part of an airdrop while ensuring privacy and preventing abuse. This runtime employs cryptographic techniques and zero-knowledge proofs (zkApps) to verify that each claim is valid without exposing sensitive user information. The runtime prevents double claims by recording unique nullifiers, ensuring that each user can claim only once.

---

## System Overview

At a high level, the runtime comprises two main modules:

- **Airdrop Module:**  
  Responsible for verifying airdrop claims. It manages the commitment (stored as a Merkle tree root), validates proofs using zero-knowledge techniques, and ensures that no nullifier (a unique identifier preventing double claims) is reused.

- **Balances Module:**  
  Manages the token balances for each user. When an airdrop claim is successfully validated, the Balances module mints tokens to the user’s account.

These modules interact via runtime methods decorated with Protokit decorators, enabling state management and secure transaction execution.

---

## Architecture and Design

### Airdrop Module

**Key Responsibilities:**

- **Commitment Management:**  
  Maintains a state variable that holds the commitment (i.e., the Merkle tree root) of the airdrop. This commitment is used as a reference during claim verification.

- **Nullifier Tracking:**  
  Uses a state map to record which nullifiers have already been used, preventing duplicate claims.

- **Proof Verification:**  
  Implements the `canClaim` function that verifies a claim by:
  - Generating a unique key from a nullifier.
  - Comparing computed roots from the Merkle witness.
  - Verifying that the nullifier corresponds to the fixed message.

- **Token Distribution:**  
  Upon successful verification, the module invokes the Balances module’s `mint` method to add tokens to the claimant’s balance.

### Balances Module

**Key Responsibilities:**

- **State Management:**  
  Uses a state map to track token balances for each public key.

- **Token Minting:**  
  Provides a method (`mint`) that updates the balance by adding the airdropped tokens to the recipient’s account.

Both modules are implemented as runtime modules using decorators such as `@runtimeModule`, `@state`, and `@runtimeMethod` from Protokit, ensuring a clean separation of concerns and secure state updates.

---

## Detailed Code Explanation

### Global Declarations and Utility Functions

Before diving into the modules, some global declarations and utility functions are defined:

```typescript
import { Field } from "o1js";

// Fixed message declaration used for nullifier verification
export const message = Field(0);

```

`message`:
A constant field with a value of 0, used as a fixed message for nullifier verification.

## Airdrop Module Walkthrough
The Airdrop Module contains several key parts:

1. **Airdrop Public Output**
   
  
```typescript
export class AirdropPublicOutput extends Struct({
    root: Field,
    nullifier: Field,
}) {}

```

**Purpose**:

This class defines the public output structure for an airdrop claim.
- `root`: The Merkle tree root that represents the airdrop commitment.
- `nullifier`: A unique field used to track claims, preventing double spending.


2. **Claim Verification Function**: `canClaim`
```typescript
export function canClaim(
    witness: MerkleMapWitness,
    nullifier: Nullifier
): AirdropPublicOutput {
    const key = Poseidon.hash(nullifier.getPublicKey().toFields());
    const [computedRoot, computedKey] = witness.computeRootAndKey(
        Bool(true).toField()
    );
    computedKey.assertEquals(key);
    nullifier.verify(message);
    return new AirdropPublicOutput({
        root: computedRoot,
        nullifier: nullifier.key(),
    });
}
```

**Steps Explained**:

**Compute Key from Nullifier**:

  Uses `Poseidon.hash` to create a unique key based on the public fields of the nullifier.

**Verify Witness**:

Computes the root and key from the provided `MerkleMapWitness` using a boolean flag.
Uses an assertion (`computedKey.assertEquals(key)`) to ensure the computed key matches the generated key.

**Nullifier Verification**:

The `nullifier.verify(message)` method confirms that the nullifier is valid with respect to the fixed message.

**Return Output**:

Constructs and returns an `AirdropPublicOutput` containing the computed Merkle root and the nullifier key.
   
3. **Airdrop Runtime Module**
```typescript
@runtimeModule()
export class Airdrop extends RuntimeModule<AirdropConfig> {
    @state() public commitment = State.from<Field>(Field);
    @state() public nullifiers = StateMap.from<Field, Bool>(Field, Bool);
    
    public constructor(
        @inject("Balances") public balances: Balances
    ) {
        super();
    }

    @runtimeMethod()
    public setCommitment(commitment: Field) {
        this.commitment.set(commitment);
    }

    @runtimeMethod()
    public claim(airdropProof: AirdropProof) {
        airdropProof.verify();
        const commitment = this.commitment.get();
        
        assert(
            commitment.isSome, 
            "Commitment not set"
        );
        assert(  
            airdropProof.publicOutput.root.equals(commitment.value),  
            "Airdrop proof does not contain the correct commitment"
        );  
        
        const nullifierKey = airdropProof.publicOutput.nullifier;
        const isNullifierUsed = this.nullifiers.get(nullifierKey);
        
        assert(
            isNullifierUsed.value.not().or(isNullifierUsed.isSome.not()), 
            "Nullifier has already been used"
        );  
        
        this.nullifiers.set(nullifierKey, Bool(true));  
        this.balances.mint(this.transaction.sender, UInt64.from(1000));
    }
}
```

**Annotations and State Management**:

- `@runtimeModule()` declares this class as a runtime module, which allows it to interact securely within the runtime environment.

`@state()` **Decorators**:

- `commitment`: Stores the Merkle tree root (airdrop commitment).

- `nullifiers`: A state map tracking nullifiers that have been used.

**Constructor**:
Uses dependency injection (`@inject("Balances")`) to obtain a reference to the Balances module.

**Runtime Methods**:
`setCommitment`:
Sets the commitment state.

`claim`:
- Verifies the provided `AirdropProof` by calling `airdropProof.verify()`.
- Retrieves and checks the current commitment, ensuring that it is set.
- Asserts that the provided proof's root matches the stored commitment.
- Retrieves the nullifier from the proof and checks (via assertions) that it hasn’t been used.
- Updates the nullifiers state and mints tokens to the sender using the Balances module.

## Balances Module Walkthrough
The Balances Module handles token balances:
```typescript
import { RuntimeModule, runtimeMethod, state } from "@proto-kit/module";
import { StateMap } from "@proto-kit/protocol";
import { PublicKey, UInt64 } from "o1js";

export class Balances extends RuntimeModule<unknown> {
  @state() public balances = StateMap.from<PublicKey, UInt64>(PublicKey, UInt64);

  @runtimeMethod()
  public mint(to: PublicKey, amount: UInt64): void {
    const balance = this.balances.get(to) ?? UInt64.zero;
    const newBalance = balance.add(amount);
    this.balances.set(to, newBalance);
  }
}
```
**Annotations**:

`@runtimeMethod()` marks the `mint` function as a method that can update the module’s state.

`@state()` initializes the balances state map.

`mint` **Method**:

- Retrieves the current balance for a given public key; if none exists, it defaults to zero.
- Computes the new balance by adding the minted amount.
- Updates the state map with the new balance.

## Testing Strategy and Examples
The project uses an integration test suite built with the `TestingAppChain` from `@proto-kit/sdk`. The tests simulate runtime transactions and validate core functionalities.

## Key Test Cases Explained
**Airdrop Commitment Setup Test**
```typescript
it("should setup the airdrop commitment", async () => {
    const tx = appChain.transaction(alice, () => {
        airdrop.setCommitment(map.getRoot());
    });
    await tx.sign();
    await tx.send();
    await appChain.produceBlock();
    const commitment = await appChain.query.runtime.Airdrop.commitment.get();
    expect(commitment?.toBigInt()).toBe(map.getRoot().toBigInt());
});
```
**Purpose**:

Verifies that the `setCommitment` method correctly stores the Merkle tree root.
The test signs and sends a transaction, produces a block, and then queries the runtime state to ensure consistency.

**Valid Claim Test**
```typescript
it("should allow claiming if a valid proof is provided", async () => {
    const nullifier = Nullifier.fromJSON(Nullifier.createTestNullifier(message, aliceKey));
    const airdropProof = await mockProof(canClaim(witness, nullifier));

    const tx = appChain.transaction(alice, () => {
        airdrop.claim(airdropProof);
    });
    await tx.sign();
    await tx.send();
    const block = await appChain.produceBlock();

    const storedNullifier = await appChain.query.runtime.Airdrop.nullifiers.get(
        airdropProof.publicOutput.nullifier
    );
    const balance = await appChain.query.runtime.Balances.balances.get(alice);

    expect(block?.txs[0].status).toBe(true);
    expect(storedNullifier?.toBoolean()).toBe(true);
    expect(balance?.toBigInt()).toBe(1000n);
});
```
**Purpose**:

Ensures that a valid airdrop claim:
- Successfully verifies the provided proof.
- Updates the nullifiers state.
- Results in tokens being minted (in this case, 1000 tokens).

**Double Claim Prevention Test**
```typescript
it("should not allow claiming if a spent nullifier is used", async () => {
    const nullifier = Nullifier.fromJSON(Nullifier.createTestNullifier(message, aliceKey));
    const firstProof = await mockProof(canClaim(witness, nullifier));
    const tx1 = appChain.transaction(alice, () => {
        airdrop.claim(firstProof);
    });
    await tx1.sign();
    await tx1.send();
    await appChain.produceBlock();

    // Attempt a second claim with the same nullifier
    const secondProof = await mockProof(canClaim(witness, nullifier));
    const tx2 = appChain.transaction(alice, () => {
        airdrop.claim(secondProof);
    });
    await tx2.sign();
    await tx2.send();
    const block2 = await appChain.produceBlock();

    const storedNullifier = await appChain.query.runtime.Airdrop.nullifiers.get(
        secondProof.publicOutput.nullifier
    );
    const balance = await appChain.query.runtime.Balances.balances.get(alice);

    expect(block2?.txs[0].status).toBe(false);
    expect(storedNullifier?.toBoolean()).toBe(true);
    expect(balance?.toBigInt()).toBe(1000n);
});
```
**Purpose**:

Verifies that once a nullifier is used, any subsequent claim using the same nullifier is rejected. This protects against double spending, ensuring the runtime enforces one claim per nullifier.

## Conclusion and Future Work

This documentation has provided an extensive walkthrough of the Private Airdrop Runtime. We have detailed the system’s architecture, provided a line-by-line explanation of the core modules, and outlined our testing strategy to ensure security and correctness.

## Future Enhancements:

- **Enhanced Proof Verification**:
Improve the cryptographic checks and integrate more advanced zero-knowledge proof systems.

- **UI Integration**:
Develop a frontend interface for real-time interaction with the runtime.

- **Expanded Testing**:
Include edge case testing and performance benchmarks to further validate the runtime under various scenarios.

## References and Resources

- [O1js Documentation](https://docs.minaprotocol.com/)
- [Protokit Documentation](https://protokit.dev/docs/what-is-protokit)
- [Mina Protocol Documentation](https://docs.minaprotocol.com/)
- [tsyringe Documentation](https://www.npmjs.com/package/tsyringe/v/2.1.1)


Thank you for reviewing the documentation for **BUILDING A PRIVATE AIRDROP RUNTIME**. We trust that the detailed explanations provided herein will help you understand the design, functionality, and potential impact of our solution. We welcome feedback and collaboration to further enhance privacy-enhanced application development on the **Mina Protocol**.

