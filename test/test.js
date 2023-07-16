const assert = require("assert");
const { expect } = require("chai");
const hre = require("hardhat");
const ethers = hre.ethers;
const childProcess = require("child_process");
const crypto = require("crypto");

const WAYMONT_SAFE_FACTORY_ABI = require("./abi/WaymontSafeFactory.json");
const WAYMONT_SAFE_POLICY_GUARDIAN_SIGNER_ABI = require("../src/abi/WaymontSafePolicyGuardianSigner.json");
const WAYMONT_SAFE_ADVANCED_SIGNER_ABI = require("../src/abi/WaymontSafePolicyGuardianSigner.json");
const SAFE_ABI = require("../src/abi/Safe.json");
const MULTI_SEND_ABI = require("../src/abi/MultiSend.json");
const SAFE_PROXY_FACTORY_ABI = require("./abi/SafeProxyFactory.json");
const STORAGE_ABI = require("./abi/Storage.json");

const WAYMONT_SAFE_FACTORY_BYTECODE = require("./bin/WaymontSafeFactory.json");
const SAFE_BYTECODE = require("./bin/Safe.json");
const SAFE_PROXY_FACTORY_BYTECODE = require("./bin/SafeProxyFactory.json");
const MULTI_SEND_BYTECODE = require("./bin/MultiSend.json");
const COMPATIBILITY_FALLBACK_HANDLER_BYTECODE = require("./bin/CompatibilityFallbackHandler.json");
const PROXY_BYTECODE = require("./bin/Proxy.json");
const STORAGE_BYTECODE = require("./bin/Storage.json");

const SAFE_SINGLETON_FACTORY_BYTECODE = "0x604580600e600039806000f350fe7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3";
const SAFE_SINGLETON_FACTORY_DEPLOYER_ADDRESS = "0xE1CB04A0fA36DdD16a06ea828007E35e1a3cBC37";
const SAFE_SINGLETON_FACTORY_ADDRESS = "0x914d7fec6aac8cd542e72bca78b30650d45643d7";
const SAFE_SINGLETON_ADDRESS = "0xc962E67D9490E154D81181879ddf4CD3b65D2132";
const SAFE_PROXY_FACTORY_ADDRESS = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67";
const COMPATIBILITY_FALLBACK_HANDLER_ADDRESS = "0x2a15DE4410d4c8af0A7b6c12803120f43C42B820";
const MULTI_SEND_ADDRESS = "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526";

const EXAMPLE_ROOT_MNEMONIC_SEED_PHRASE = "shove modify pet author control topic today opera okay payment diary provide";
const EXAMPLE_VAULT_SUBKEY_INDEX = 12345678;
const HD_PATH = "m/44/60/0/0";

function runAndWait(script) {
    return new Promise((resolve, reject) => {
        var process = childProcess.fork(script);
        process.on("error", reject);
        process.on("exit", (error) => {
            if (error == 0) resolve();
            else reject("Process exited with error code " + error);
        })
    });
}

// Get HD node child signing key for Safe
const myNode = ethers.utils.HDNode.fromMnemonic(EXAMPLE_ROOT_MNEMONIC_SEED_PHRASE);
const myChild = myNode.derivePath(HD_PATH + "/" + EXAMPLE_VAULT_SUBKEY_INDEX);
const myChildWallet = new ethers.Wallet(myChild.privateKey);
const myChildSigningKey = myChildWallet._signingKey();

// Address prediction functions
function predictWaymontSafeAdvancedSignerAddress(predictedSafeAddress, signers, threshold, deploymentNonce) {
    const salt = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(
        ["address", "address[]", "uint256", "uint256"],
        [predictedSafeAddress, signers, threshold, deploymentNonce]
    ));
    const initCodeHash = ethers.utils.keccak256(ethers.utils.solidityPack(
        ["bytes", "address", "bytes"],
        [
            "0x3d602d80600a3d3981f3363d3d373d3d3d363d73",
            WAYMONT_SAFE_ADVANCED_SIGNER_IMPLEMENTATION_ADDRESS,
            "5af43d82803e903d91602b57fd5bf3"
        ]
    ));
    const waymontSafeAdvancedSignerAddress = ethers.utils.keccak256(ethers.utils.solidityPack(
        ["bytes1", "address", "bytes32", "bytes32"],
        ["0xff", WAYMONT_SAFE_FACTORY_ADDRESS, salt, initCodeHash]
    ));
    return waymontSafeAdvancedSignerAddress;
}

function predictSafeAddress(initializerData, saltNonce) {
    const salt = ethers.utils.keccak256(ethers.utils.solidityPack(
        ["bytes", "uint256"],
        [initializerData, saltNonce]
    ));
    const initCodeHash = ethers.utils.keccak256(ethers.utils.solidityPack(
        ["bytes", "address"],
        [
            PROXY_BYTECODE,
            SAFE_SINGLETON_ADDRESS
        ]
    ));
    const safeAddress = ethers.utils.keccak256(ethers.utils.solidityPack(
        ["bytes1", "address", "bytes32", "bytes32"],
        ["0xff", SAFE_PROXY_FACTORY_ADDRESS, salt, initCodeHash]
    ));
    return safeAddress;
}

// Run async code
describe("Policy guardian recovery script", function () {
    it("Scripts should recover the Safe from the policy guardian", async function () {
        // Get signers
        const [relayer, policyGuardianManager, policyGuardian] = await ethers.getSigners();

        // Deploy Safe singleton factory
        await relayer.sendTransaction({ to: SAFE_SINGLETON_FACTORY_DEPLOYER_ADDRESS, value: "1000000000000000000" });
        const impersonatedSigner = await ethers.getImpersonatedSigner(SAFE_SINGLETON_FACTORY_DEPLOYER_ADDRESS);
        await impersonatedSigner.sendTransaction({ data: SAFE_SINGLETON_FACTORY_BYTECODE });

        // Deploy Safe implementation, Safe proxy factory, etc.
        await relayer.sendTransaction({ to: SAFE_SINGLETON_FACTORY_ADDRESS, data: "0x0000000000000000000000000000000000000000000000000000000000000000" + (SAFE_BYTECODE.substring(0, 2) === "0x" ? SAFE_BYTECODE.substring(2) : SAFE_BYTECODE) });
        await relayer.sendTransaction({ to: SAFE_SINGLETON_FACTORY_ADDRESS, data: "0x0000000000000000000000000000000000000000000000000000000000000000" + (SAFE_PROXY_FACTORY_BYTECODE.substring(0, 2) === "0x" ? SAFE_PROXY_FACTORY_BYTECODE.substring(2) : SAFE_PROXY_FACTORY_BYTECODE) });
        await relayer.sendTransaction({ to: SAFE_SINGLETON_FACTORY_ADDRESS, data: "0x0000000000000000000000000000000000000000000000000000000000000000" + (MULTI_SEND_BYTECODE.substring(0, 2) === "0x" ? MULTI_SEND_BYTECODE.substring(2) : MULTI_SEND_BYTECODE) });
        await relayer.sendTransaction({ to: SAFE_SINGLETON_FACTORY_ADDRESS, data: "0x0000000000000000000000000000000000000000000000000000000000000000" + (COMPATIBILITY_FALLBACK_HANDLER_BYTECODE.substring(0, 2) === "0x" ? COMPATIBILITY_FALLBACK_HANDLER_BYTECODE.substring(2) : COMPATIBILITY_FALLBACK_HANDLER_BYTECODE) });

        // Deploy Waymont Safe contracts
        const waymontSafeFactoryContractFactory = new ethers.ContractFactory(WAYMONT_SAFE_FACTORY_ABI, WAYMONT_SAFE_FACTORY_BYTECODE);
        const waymontSafeFactoryContract = await waymontSafeFactoryContractFactory.deploy(policyGuardianManager.address);
        const expectedPolicyGuardianSignerContractAddress = ethers.utils.getContractAddress({ from: waymontSafeFactoryContract.address, nonce: 1 });
        const waymontSafePolicyGuardianSignerContract = new ethers.Contract(expectedPolicyGuardianSignerContractAddress, WAYMONT_SAFE_POLICY_GUARDIAN_SIGNER_ABI);
        await waymontSafePolicyGuardianSignerContract.setPolicyGuardian(policyGuardian.address);

        // Test on Safe with policy guardian and 3 EOA signers; also test on Safe with policy guardian and advanced signer (with 1 underlying signer, 2 underlying signers, and 3 underlying signers)
        const safeInterface = new ethers.utils.Interface(SAFE_ABI);
        const extraSigners = [ethers.Wallet.createRandom().address, ethers.Wallet.createRandom().address];

        for (const advancedSignerUnderlyingSignerCount = 0; advancedSignerUnderlyingSignerCount <= 3; advancedSignerUnderlyingSignerCount++) {
            // Safe init params
            const initialOverlyingSigners = advancedSignerUnderlyingSignerCount > 0 ? [
                waymontSafePolicyGuardianSignerContract.address
            ] : [
                waymontSafePolicyGuardianSignerContract.address,
                myChildWallet.address,
                extraSigners[0],
                extraSigners[1]
            ];
            const initialOverlyingThreshold = advancedSignerUnderlyingSignerCount > 0 ? 1 : 2;

            // Deploy Safe
            const safeInitializerData = safeInterface.encodeFunctionData("setup", [
                initialOverlyingSigners,
                initialOverlyingThreshold,
                "0x0000000000000000000000000000000000000000",
                "0x",
                COMPATIBILITY_FALLBACK_HANDLER_ADDRESS,
                "0x0000000000000000000000000000000000000000",
                "0",
                "0x0000000000000000000000000000000000000000"
            ]);
            const safeSaltNonce = 0;
            const safeProxyFactory = new ethers.Contract(SAFE_PROXY_FACTORY_ADDRESS, SAFE_PROXY_FACTORY_ABI);
            await safeProxyFactory.createProxyWithNonce(SAFE_SINGLETON_ADDRESS, safeInitializerData, safeSaltNonce);
            const safeAddress = predictSafeAddress(safeInitializerData, safeSaltNonce);
            const mySafeContract = new ethers.Contract(safeAddress, SAFE_ABI);

            // AdvancedSigner stuff
            if (advancedSignerUnderlyingSignerCount > 0) {
                // Generate predictedAdvancedSignerAddress
                let underlyingSigners = [myChildWallet.address];
                for (const i = 1; i < advancedSignerUnderlyingSignerCount; i++) underlyingSigners.push(extraSigners[i - 1]);
                const underlyingThreshold = 1;
                const advancedSignerDeploymentNonce = "0x" + crypto.randomBytes(32).toString('hex');
                const predictedAdvancedSignerAddress = predictWaymontSafeAdvancedSignerAddress(safeAddress, underlyingSigners, underlyingThreshold, advancedSignerDeploymentNonce);

                // Generate transactions to send
                const transactions = [
                    {
                        to: safe.address,
                        data: safe.interface.encodeFunctionData("addOwnerWithThreshold", [predictedAdvancedSignerAddress, 2])
                    },
                    {
                        to: waymontSafeFactory.address,
                        data: waymontSafeFactory.interface.encodeFunctionData("createAdvancedSigner", [safeAddress, underlyingSigners, underlyingThreshold, advancedSignerDeploymentNonce])
                    },
                ];

                // Encode MultiSend.multiSend function data
                const multiSendInterface = new ethers.utils.Interface(MULTI_SEND_ABI);

                let packedTransactions = "0x";
                for (const tx of transactions) packedTransactions += ethers.utils.solidityPack(["uint8", "address", "uint256", "uint256", "bytes"], [0, tx.to, 0, tx.data.length, tx.data]).substring(2);

                let data = multiSendInterface.encodeFunctionData("multiSend", [packedTransactions]);

                // Prepare rest of params for Safe.execTransaction
                const to = MULTI_SEND_ADDRESS;
                const value = 0;
                const operation = 1;
                const safeTxGas = 0;
                const baseGas = 0;
                const gasPrice = 0;
                const gasToken = "0x0000000000000000000000000000000000000000";
                const refundReceiver = "0x0000000000000000000000000000000000000000";

                // Sign params for Safe.execTransaction
                const nonce = await mySafeContract.nonce();

                const encodedData = ethers.utils.defaultAbiCoder.encode(
                    ['bytes32', 'address', 'uint256', 'bytes32', 'uint8', 'uint256', 'uint256', 'uint256', 'address', 'address', 'uint256'],
                    [SAFE_TX_TYPEHASH, to, value, ethers.utils.keccak256(data), operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, nonce]
                );

                const safeTxHash = ethers.utils.keccak256(encodedData);
                const domainSeparator = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256", "address"], [DOMAIN_SEPARATOR_TYPEHASH, myProvider.network.chainId, mySafeContract.address]));

                const encodedTransactionData = solidityPack(
                    ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
                    ['0x19', '0x01', domainSeparator, safeTxHash],
                );

                const overlyingHash = ethers.utils.keccak256(encodedTransactionData);
                const userSignature = myChildSigningKey.signDigest(overlyingHash);

                // Dispatch TX
                const tx = await mySafeContract.execTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, userSignature);
                console.log("Submitted Safe.execTransaction with transaction hash:", tx.transactionHash);

                // Assert signers on AdvancedSigner are correct
                const myWaymontSafeAdvancedSignerContract = new ethers.Contract(predictWaymontSafeAdvancedSignerAddress, WAYMONT_SAFE_ADVANCED_SIGNER_ABI);
                const underlyingOwners = await myWaymontSafeAdvancedSignerContract.getOwners();
                assert(underlyingOwners.length == advancedSignerUnderlyingSignerCount && underlyingOwners[0] == myChildWallet.address);
                expect(await myWaymontSafeAdvancedSignerContract.threshold()).to.equal(2);

                // Assert signers on Safe are correct
                const safeOwners = await mySafeContract.getOwners();
                assert(safeOwners.length == 2 && safeOwners[0] == waymontSafePolicyGuardianSignerContract.address && safeOwners[1] == predictedAdvancedSignerAddress);
                expect(await mySafeContract.threshold()).to.equal(2);
            } else {
                // Assert signers on Safe are correct
                const safeOwners = await mySafeContract.getOwners();
                assert(safeOwners.length == 4 && safeOwners[0] == waymontSafePolicyGuardianSignerContract.address && safeOwners[1] == myChildWallet.address);
                expect(await mySafeContract.threshold()).to.equal(2);
            }

            // Run script: initiate-recovery.js
            await runAndWait("npm run initiate-recovery http://localhost:8545 " + safeAddress + " " + EXAMPLE_VAULT_SUBKEY_INDEX + " " + relayer._signingKey().privateKey + " \"" + EXAMPLE_ROOT_MNEMONIC_SEED_PHRASE + "\"");
            
            // Assert recovery process has begun
            expect(await waymontSafePolicyGuardianSignerContract.disablePolicyGuardianQueueTimestamps(safeAddress)).to.be.above(0);

            // Wait almost 14 days (evm_increaseTime)
            await ethers.provider.send("evm_increaseTime", [14 * 86400 - 60]);

            // Expect failure running script: execute-recovery.js
            assert.throws(runAndWait("npm run execute-recovery http://localhost:8545 " + safeAddress + " " + EXAMPLE_VAULT_SUBKEY_INDEX + " " + relayer._signingKey().privateKey + " \"" + EXAMPLE_ROOT_MNEMONIC_SEED_PHRASE + "\""));
            
            // Wait 60 seconds to get to past the full 14-day timelock (evm_increaseTime)
            await ethers.provider.send("evm_increaseTime", [60]);

            // Run script: execute-recovery.js
            await runAndWait("npm run execute-recovery http://localhost:8545 " + safeAddress + " " + EXAMPLE_VAULT_SUBKEY_INDEX + " " + relayer._signingKey().privateKey + " \"" + EXAMPLE_ROOT_MNEMONIC_SEED_PHRASE + "\"");
            
            // Assert policy guardian signer no longer present and rest of signers are correct
            const safeOwners = await mySafeContract.getOwners();
            assert(safeOwners.length == advancedSignerUnderlyingSignerCount > 0 ? advancedSignerUnderlyingSignerCount : 3 && safeOwners[0] == myChildWallet.address);
            for (const i = 1; i < advancedSignerUnderlyingSignerCount; i++) assert(safeOwners[i] == extraSigners[i - 1]);
            
            // Deploy dummy storage contract and get calldata to store value
            const storageContractFactory = new ethers.ContractFactory(STORAGE_ABI, STORAGE_BYTECODE);
            const storageContract = await storageContractFactory.deploy();
            const exampleCall1Data = storageContract.interface.encodeFunctionData("store", [5678]);

            // Run script: execute-safe-transactions.js
            await runAndWait("npm run execute-safe-transactions http://localhost:8545 " + safeAddress + " " + EXAMPLE_VAULT_SUBKEY_INDEX + " " + relayer._signingKey().privateKey + " \"" + EXAMPLE_ROOT_MNEMONIC_SEED_PHRASE + "\" " + storageContract.address + " " + exampleCall1Data +  " 0 0x0000000000000000000000000000000000002222 0x 1234");

            // Assertions
            expect(await storageContract.retrieve(safeAddress)).to.equal(5678);
            expect(await provider.getBalance("0x0000000000000000000000000000000000002222")).to.equal(1234);
        }
    });
});
