# Waymont Wallet Global Recovery Script

Recovery script for use in the event that Waymont's relay guardian (i.e., transaction policy guardian) malfunctions.

## Instructions

### Export Private Key

First, export your 12-word mnemonic seed phrase (root private key) from your Waymont mobile signer app:

1. Open the Waymont mobile app on your mobile app.
2. Hit the settings button.
3. Hit "Export Private Key" to export your HD (hierarchical deterministic) wallet root private key.
4. Confirm that you are aware of the security implications of exporting your root private key.
5. Authenticate using biometrics.
6. The app will display your root private key in the form of a 12-word mneumonic seed phrase.
7. Do not attempt to transmit this sensitive phrase to your computer electronically--simply type it directly into the recovery script described below on your computer.

### Command Line Prerequisites

1. [Download and install Node.js](https://nodejs.org/en/download/) or [install Node.js via a package manager](https://nodejs.org/en/download/package-manager/) (we prefer [`nvm`--Node Version Manager](https://github.com/nvm-sh/nvm#install--update-script)).
2. Before running the scripts, run the following command to disable bash history so your keys are not saved to disk: `set +o history`

### Recover Each Wallet Address

On your computer, for each wallet address you would like to export:

#### Identify Wallet Deployment Nonce

Identify the deployment nonce of the wallet. This can be found in the wallet's contract creation transaction input data on Etherscan: simply go the wallet contract on Etherscan, click on the transaction hash listed after "at txn" under "CONTRACT CREATOR" (inside the "More Info" card in the middle of the row of cards at the top of the page), go to the bottom of the page where it says "Input Data", click the "Decode Input Data" button, and you'll see the deployment nonce listed under the "Data" column in the row whose "Name" is `nonce`.

#### Initiate Wallet Recovery (if necessary)

Note that if Waymont has globally disabled the relay guardian/transaction policy engine on all wallets (as a result of the business shutting down, for example), you do not need to run the wallet recovery initiation script and wait for the 14-day timelock to pass--you can go straight to running the execution script.

Run the following commands to intiate wallet recovery:

```
git clone https://github.com/pentagonxyz/waymont-wallet-global-recovery-script
cd waymont-wallet-global-recovery-script
node initiate-recovery.js http://localhost:8545 0xYOURWALLETCONTRACTADDRESSHERE YOURWALLETCONTRACTDEPLOYMENTNONCE 0xFUNDEDPRIVATEKEYFORGAS "type your mnemonic phrase here"
```

Assuming that the initiation script passed with a transaction hash, you should wait for the 14-day timelock to pass before executing wallet recovery.

#### Execute Wallet Recovery

If necessary, wait for the 14-day timelock to pass; then, run the following commands to complete recovery of your wallet:

```
node execute-recovery.js http://localhost:8545 0xYOURWALLETCONTRACTADDRESSHERE YOURWALLETCONTRACTDEPLOYMENTNONCE 0xFUNDEDPRIVATEKEYFORGAS "type your mnemonic phrase here" 0xEXAMPLECALL1TARGET 0xEXAMPLECALL1DATA EXAMPLECALL1VALUE 0xEXAMPLECALL2TARGET 0xEXAMPLECALL2DATA EXAMPLECALL2VALUE
```

- Replace `http://localhost:8545` with your Web3 provider's JSON-RPC API endpoint URL--for example: `https://mainnet.infura.io/v3/YOUR-API-KEY`.
- Replace `0xYOURWALLETCONTRACTADDRESSHERE` with your Waymont smart contract wallet address.
- Replace `YOURWALLETCONTRACTDEPLOYMENTNONCE` with the deployment nonce integer you found on Etherscan in step 8B.
- Replace `0xFUNDEDPRIVATEKEYFORGAS` with an Ethereum account's private key with enough Ethereum for the gas costs necessary to send the transactions you would like to send.
- Replace `type your mnemonic phrase here` with your mnemonic seed phrase.
- Replace `0xEXAMPLECALL1TARGET 0xEXAMPLECALL1DATA EXAMPLECALL1VALUE 0xEXAMPLECALL2TARGET 0xEXAMPLECALL2DATA EXAMPLECALL2VALUE` with the following values, all separated by spaces: for each transaction you want to send, enter the target address, data to be sent to the target, and ETH value to be sent to the target.
    - If you are simply trying to send ETH to a target without any contract function call data, just use "0x" for the data parameter.

Note that the execution script will tell you how long you have left to wait in the event of failure.
