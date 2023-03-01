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
        "name": "disableRelayerWhitelist",
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
            },
            {
                "internalType": "address[]",
                "name": "targets",
                "type": "address[]"
            },
            {
                "internalType": "bytes[]",
                "name": "data",
                "type": "bytes[]"
            },
            {
                "internalType": "uint256[]",
                "name": "values",
                "type": "uint256[]"
            },
            {
                "internalType": "uint256[4]",
                "name": "feeData",
                "type": "uint256[4]"
            },
            {
                "internalType": "uint8",
                "name": "debug",
                "type": "uint8"
            }
        ],
        "name": "functionCallMulti",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "nonce",
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
    }
];

assert(process.argv.length >= 10, "Not enough arguments supplied--you should have 8 arguments if you are calling one function, 11 if you are calling two, 14 if you are calling three, and so on.");
assert(process.argv[2].length > 0, "The JSON-RPC provider URL you entered is not valid.");
assert(process.argv[3].length === 42 && process.argv[3].substring(0, 2) === "0x", "The wallet contract address you entered is not valid.");
assert(/^\d+$/.test(process.argv[4]), "The wallet contract deployment nonce you entered is not valid.");
assert(process.argv[5].length === 66 && process.argv[5].substring(0, 2) === "0x", "The funded Ethereum account private key you supplied (for gas fees) is not valid.");
assert(process.argv[6].split(" ").length === 12, "The mnemonic seed phrase you entered is not valid (should be 12 words separated by spaces).");
assert((process.argv.length - 10) % 3 == 0, "Invalid arguments supplied--you should have 8 arguments if you are calling one function, 11 if you are calling two, 14 if you are calling three, and so on.");
for (var i = 7; i < process.argv.length; i += 3) assert(process.argv[i].length === 42 && process.argv[i].substring(0, 2) === "0x", "One or more function call target parameters is not valid.");
for (var i = 8; i < process.argv.length; i += 3) assert(process.argv[i].length >= 2 && process.argv[i].substring(0, 2) === "0x", "One or more function call data parameters is not valid.");
for (var i = 9; i < process.argv.length; i += 3) assert(/^\d+$/.test(process.argv[i]), "One or more function call value parameters is not valid.");

let myProvider = new ethers.providers.JsonRpcProvider(process.argv[2]);
let myFundedAccountForGas = new ethers.Wallet(process.argv[4], myProvider);
let myWalletContract = new ethers.Contract(process.argv[3], WALLET_CONTRACT_ABI, myFundedAccountForGas);

const myNode = ethers.utils.HDNode.fromMnemonic(mnemonic);
const myChild = node.derivePath(hdPath + `/${process.argv[4]}`);
const myChildWallet = new Wallet(child.privateKey);
const myChildSigningKey = childWallet._signingKey();

let timelock = await myWalletContract.relayerWhitelistTimelock();

if (timelock > 0) {
  let queueTimestamp = await myWalletContract.disableRelayerWhitelistQueueTimestamp();
  assert(queueTimestamp > 0, "Wallet recovery has not been initiated. Please run the intiation script first.");
  assert(queueTimestamp + timelock <= (new Date()).getTime() / 1000, "Timelock has not yet passed, though wallet recovery has been initiated.");

  let dataHash = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["uint256", "address", "uint256", "bytes4"], [myProvider.network.chainId, myWalletContract.address, ++(await myWalletContract.nonce()), myWalletContract.interface.getSighash("disableRelayerWhitelist")]));
  let signatures = [myChildSigningKey.signDigest(dataHash)];
    
  let tx = await myWalletContract.disableRelayerWhitelist(signatures);
  console.log("Submitted disableRelayerWhitelist with transaction hash:", tx.transactionHash);
}

let targets = [];
let data = [];
let values = [];
for (var i = 7; i < process.argv.length; i += 3) targets.push(process.argv[i]);
for (var i = 8; i < process.argv.length; i += 3) data.push(process.argv[i]);
for (var i = 9; i < process.argv.length; i += 3) values.push(process.argv[i]);

let feeData = ["1000000000000000000000000000000000000", "1000000000000000000000000000000000000", "1000000000000000000000000000000000000", "0"]; // Set first 3 thresholds to a very high value (1e36) to avoid crossing them and set paymaster incentive to 0 as we are now the paymaster
let dataHash = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["uint256", "address", "uint256", "bytes4", "address[]", "bytes[]", "uint256[]", "uint256[4]"], [myProvider.network.chainId, myWalletContract.address, ++(await myWalletContract.nonce()), myWalletContract.interface.getSighash("functionCallMulti"), targets, data, values, feeData]));
let signatures = [myChildSigningKey.signDigest(dataHash)];

let tx = await wallet.functionCallMulti(signatures, targets, data, values, feeData);
console.log("Submitted functionCallMulti with transaction hash:", tx.transactionHash);
