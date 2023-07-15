# Waymont Vaults Global Recovery Script

Recovery script for use in the event that Waymont's transaction policy guardian (or other critical off-chain infrastructure) malfunctions.

## Instructions

### Export Private Key

First, export your 12-word mnemonic seed phrase (root private key) and your vault subkey indexes from your Waymont mobile signer app:

1. Open the Waymont mobile app on your mobile app.
2. Hit the settings button.
3. Hit "Export Private Key" to export your root private key (seed phrase).
4. Confirm that you are aware of the security implications of exporting your root private key.
5. Authenticate using biometrics.
6. The app will display your unencrypted root private key in the form of a 12-word mneumonic seed phrase.
    - **WARNING: Do NOT attempt to transmit this sensitive private key to your computer electronically--simply MANUALLY type it directly into the recovery script (described below) on your computer.**
7. Take note our your vault subkey indexes as well.
    - While they do not need to be private, these are necessary to recover your vaults using this script (as they provide the paths to derive the keys for each vault from your root key).

*As with many other self-custody providers, your 12-word mnemonic seed phrase is the root private key of a HD (hierarchical deterministic) tree of signers for each Waymont vault you own or are a guardian on. However, Waymont does not ask users to manually back it up as it should only be needed in the case of emergency recovery from the policy guardian as described in this document.*

### Command Line Prerequisites

1. [Download and install Node.js](https://nodejs.org/en/download/) or [install Node.js via a package manager](https://nodejs.org/en/download/package-manager/) (we prefer [`nvm`--Node Version Manager](https://github.com/nvm-sh/nvm#install--update-script)).
2. **WARNING: Before running the scripts, run the following command to disable bash (command line) history so your unencrypted seed phrase is NOT saved to disk: `set +o history`**

### Recover Each Vault Address Individually

On your computer, for each Waymont vault address you would like to export:

#### Identify Vault Subkey Index

Using the list of vault subkey index found in or exported from the Waymont mobile signer app ([as described above](#export-private-key)), identify the vault subkey index corresponding to the Waymont vault address you are looking to recover.

#### Initiate Vault Recovery if Necessary

Note that if Waymont has globally disabled the relay guardian/transaction policy engine on all vaults (as a result of the business shutting down, for example), you do not need to run the vault recovery initiation script and wait for the 14-day timelock to pass--you can go straight to running the execution script.

Run the following commands to intiate vault recovery:

```
git clone https://github.com/pentagonxyz/waymont-vaults-global-recovery-script
cd waymont-vaults-global-recovery-script
node initiate-recovery.js http://localhost:8545 0xYOURWALLETCONTRACTADDRESSHERE YOURVAULTSUBKEYINDEX 0xFUNDEDPRIVATEKEYFORGAS "type your mnemonic phrase here"
```

Assuming that the initiation script passed with a transaction hash, you should wait for the 14-day timelock to pass before executing wallet recovery.

#### Execute Vault Recovery

If necessary, wait for the 14-day timelock to pass; then, run the following commands to complete recovery of your wallet:

```
node execute-recovery.js http://localhost:8545 0xYOURVAULTSAFECONTRACTADDRESSHERE YOURVAULTSUBKEYINDEX 0xFUNDEDPRIVATEKEYFORGAS "type your mnemonic phrase here"
```

- Replace `http://localhost:8545` with your Web3 provider's JSON-RPC API endpoint URL--for example: `https://mainnet.infura.io/v3/YOUR-API-KEY`.
- Replace `0xYOURVAULTSAFECONTRACTADDRESSHERE` with your Waymont vault (`Safe` smart contract) address.
- Replace `YOURVAULTSUBKEYINDEX` with the vault subkey index integer you found on Etherscan in step 8B.
- Replace `0xFUNDEDPRIVATEKEYFORGAS` with an Ethereum account's private key with enough Ethereum for the gas costs necessary to send the transactions you would like to send.
- Replace `type your mnemonic phrase here` with your mnemonic seed phrase.

In the event of failure, the execution script will also tell you how long you have left to wait.
