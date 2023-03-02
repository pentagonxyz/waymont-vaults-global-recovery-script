const assert = require("assert");
const ethers = require("ethers");

const WALLET_CONTRACT_ABI = [
    {
        "inputs": [
            {
                "components": [
                    {
                        "internalType": "bytes32",
                        "name": "r",
                        "type": "bytes32"
                    },
                    {
                        "internalType": "bytes32",
                        "name": "s",
                        "type": "bytes32"
                    },
                    {
                        "internalType": "uint8",
                        "name": "v",
                        "type": "uint8"
                    }
                ],
                "internalType": "struct Wallet.Signature[]",
                "name": "signatures",
                "type": "tuple[]"
            }
        ],
        "name": "queueDisableRelayerWhitelist",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "disableRelayerWhitelistQueueTimestamp",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "relayerWhitelistTimelock",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
];

const WALLET_FACTORY_CONTRACT_ABI = [
    {
        "inputs": [],
        "name": "relayGuardian",
        "outputs": [
            {
                "internalType": "address",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    }
];

assert(process.argv.length == 7, "Invalid number of arguments supplied--you should have exactly 5 arguments.");
assert(process.argv[2].length > 0, "The JSON-RPC provider URL you entered is not valid.");
assert(process.argv[3].length === 42 && process.argv[3].substring(0, 2) === "0x", "The wallet contract address you entered is not valid.");
assert(/^\d+$/.test(process.argv[4]), "The wallet contract deployment nonce you entered is not valid.");
assert(process.argv[5].length === 66 && process.argv[5].substring(0, 2) === "0x", "The funded Ethereum account private key you supplied (for gas fees) is not valid.");
assert(process.argv[6].split(" ").length === 12, "The mnemonic seed phrase you entered is not valid (should be 12 words separated by spaces).");

let myProvider = new ethers.providers.JsonRpcProvider(process.argv[2]);
let myFundedAccountForGas = new ethers.Wallet(process.argv[4], myProvider);
let myWalletContract = new ethers.Contract(process.argv[3], WALLET_CONTRACT_ABI, myFundedAccountForGas);

const myNode = ethers.utils.HDNode.fromMnemonic(mnemonic);
const myChild = node.derivePath(hdPath + `/${process.argv[4]}`);
const myChildWallet = new Wallet(child.privateKey);
const myChildSigningKey = childWallet._signingKey();

let walletFactoryAddress = await myWalletContract.walletFactory();
let walletFactoryContract = new ethers.Contract(walletFactoryAddress, WALLET_FACTORY_CONTRACT_ABI);
let relayGuardian = await walletFactoryContract.relayGuardian();
assert(relayGuardian !== "0x0000000000000000000000000000000000000000", "Relay guardian has already been disabled by Waymont. Use the recovery execution script instead.");

let timelock = await myWalletContract.relayerWhitelistTimelock();
assert(timelock > 0, "Timelock has already passed. Use the recovery execution script instead.");
let queueTimestamp = await myWalletContract.disableRelayerWhitelistQueueTimestamp();
assert(queueTimestamp == 0, queueTimestamp + timelock <= (new Date()).getTime() / 1000 ? "Timelock has already passed. Use the recovery execution script instead." : "Wallet recovery has been initiated but timelock has not passed. " + (queueTimestamp + timelock - (new Date()).getTime() / 1000) + " seconds to go.");

let dataHash = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["uint256", "address", "uint256", "bytes4"], [myProvider.network.chainId, myWalletContract.address, ++(await myWalletContract.nonce()), myWalletContract.interface.getSighash("queueDisableRelayerWhitelist")]));
let signatures = [myChildSigningKey.signDigest(dataHash)];

let tx = await myWalletContract.queueDisableRelayerWhitelist(signatures);
console.log("Submitted queueDisableRelayerWhitelist with transaction hash:", tx.transactionHash);
