# Waymont Wallet Global Recovery Script

Recovery script for use in the event that Waymont's relay guardian (i.e., transaction policy guardian) malfunctions.

## Instructions

1. Open the Waymont mobile app on your mobile app.
2. Hit the settings button.
3. Hit "Export Private Key" to export your HD (hierarchical deterministic) wallet root private key.
4. Confirm that you are aware of the security implications of exporting your root private key.
5. Authenticate using biometrics.
6. The app will display your root private key in the form of a 12-word mneumonic seed phrase.
7. Do not attempt to transmit this sensitive phrase to your computer electronically--simply type it directly into the recovery script described below on your computer.

On your computer, for each wallet address you would like to export:

Identify the deployment nonce of the wallet. This can be found in the wallet's contract creation transaction input data on Etherscan: simply go the wallet contract on Etherscan, click on the transaction hash listed after "at txn" under "CONTRACT CREATOR" (inside the "More Info" card in the middle of the row of cards at the top of the page), go to the bottom of the page where it says "Input Data", click the "Decode Input Data" button, and you'll see the deployment nonce listed under the "Data" column in the row whose "Name" is `nonce`.

Run the following commands:

```
git clone https://github.com/pentagonxyz/waymont-wallet-global-recovery-script
cd waymont-global-recovery-script
node index.js http://localhost:8545 0xYOURWALLETCONTRACTADDRESSHERE YOURWALLETCONTRACTDEPLOYMENTNONCE 0xFUNDEDPRIVATEKEYFORGAS "type your mnemonic phrase here" 0xEXAMPLETARGET1 0xEXAMPLEDATA1 0xEXAMPLETARGET2 0xEXAMPLEDATA2
```

- Replace `http://localhost:8545` with your Web3 provider's JSON-RPC API endpoint URL--for example: `https://mainnet.infura.io/v3/YOUR-API-KEY`.
- Replace `0xYOURWALLETCONTRACTADDRESSHERE` with your Waymont smart contract wallet address.
- Replace `YOURWALLETCONTRACTDEPLOYMENTNONCE` with the deployment nonce integer you found on Etherscan in step 8B.
- Replace `0xFUNDEDPRIVATEKEYFORGAS` with an Ethereum account's private key with enough Ethereum for the gas costs necessary to send the transactions you would like to send.
- Replace `type your mnemonic phrase here` with your mnemonic seed phrase.
- Replace `0xEXAMPLECALL1TARGET 0xEXAMPLECALL1DATA 0xEXAMPLECALL2TARGET 0xEXAMPLECALL2DATA` with the following: for each transaction you want to send, enter the target address and data to be sent to the target (if you are simply trying to send ETH to a target without any contract function call data, just use "0x" for the data parameter.)
