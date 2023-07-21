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
const WAYMONT_SAFE_FACTORY_ADDRESS = "0xf4699AE909Ee03e72e57F2a8BBB01C47B71C34f7";
const WAYMONT_SAFE_POLICY_GUARDIAN_SIGNER_CONTRACT_ADDRESS = "0x5B34e701393b197d267e6619d01711121F3e87Ce";
const WAYMONT_SAFE_ADVANCED_SIGNER_IMPLEMENTATION_ADDRESS = "0x1987Af72Db975d7909F5b9444ad9aEeADd3850F1";
const WAYMONT_POLICY_GUARDIAN_MANAGER_ADDRESS = "0x67161d9ad1478ae44b35d24985f2d7c4cb88f61a";

const DOMAIN_SEPARATOR_TYPEHASH = "0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218";
const SAFE_TX_TYPEHASH = "0xbb8310d486368db6bd6f849402fdd73ad53d316b5a4b2644ad6efe0f941286d8";

const EXAMPLE_ROOT_MNEMONIC_SEED_PHRASE = "shove modify pet author control topic today opera okay payment diary provide";
const EXAMPLE_VAULT_SUBKEY_INDEX = 12345678;
const HD_PATH = "m/44/60/0/0";

function runAndWait(script, args) {
    return new Promise((resolve, reject) => {
        var process = childProcess.fork(script, args);
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
            "0x5af43d82803e903d91602b57fd5bf3"
        ]
    ));
    const waymontSafeAdvancedSignerAddress = ethers.utils.keccak256(ethers.utils.solidityPack(
        ["bytes1", "address", "bytes32", "bytes32"],
        ["0xff", WAYMONT_SAFE_FACTORY_ADDRESS, salt, initCodeHash]
    ));
    return "0x" + waymontSafeAdvancedSignerAddress.substring(26);
}

function predictSafeAddress(initializerData, saltNonce) {
    const salt = ethers.utils.keccak256(ethers.utils.solidityPack(
        ["bytes32", "uint256"],
        [ethers.utils.keccak256(initializerData), saltNonce]
    ));
    const initCodeHash = ethers.utils.keccak256(ethers.utils.solidityPack(
        ["bytes", "uint256"],
        [
            PROXY_BYTECODE,
            ethers.utils.hexZeroPad(SAFE_SINGLETON_ADDRESS, 32)
        ]
    ));
    const safeAddress = ethers.utils.keccak256(ethers.utils.solidityPack(
        ["bytes1", "address", "bytes32", "bytes32"],
        ["0xff", SAFE_PROXY_FACTORY_ADDRESS, salt, initCodeHash]
    ));
    return "0x" + safeAddress.substring(26);
}

// Run async code
describe("Policy guardian recovery script", function () {
    it("Scripts should recover the Safe from the policy guardian", async function () {
        // Get signers
        const [relayer] = await ethers.getSigners();

        // Deploy Safe singleton factory
        await relayer.sendTransaction({ to: SAFE_SINGLETON_FACTORY_DEPLOYER_ADDRESS, value: "1000000000000000000" });
        const impersonatedSafeSingletonFactoryDeployer = await ethers.getImpersonatedSigner(SAFE_SINGLETON_FACTORY_DEPLOYER_ADDRESS);
        await impersonatedSafeSingletonFactoryDeployer.sendTransaction({ data: SAFE_SINGLETON_FACTORY_BYTECODE });

        // Deploy Safe implementation, Safe proxy factory, etc.
        await relayer.sendTransaction({ to: SAFE_SINGLETON_FACTORY_ADDRESS, data: "0x0000000000000000000000000000000000000000000000000000000000000000" + (SAFE_BYTECODE.startsWith("0x") ? SAFE_BYTECODE.substring(2) : SAFE_BYTECODE) });
        await relayer.sendTransaction({ to: SAFE_SINGLETON_FACTORY_ADDRESS, data: "0x0000000000000000000000000000000000000000000000000000000000000000" + (SAFE_PROXY_FACTORY_BYTECODE.startsWith("0x") ? SAFE_PROXY_FACTORY_BYTECODE.substring(2) : SAFE_PROXY_FACTORY_BYTECODE) });
        await relayer.sendTransaction({ to: SAFE_SINGLETON_FACTORY_ADDRESS, data: "0x0000000000000000000000000000000000000000000000000000000000000000" + (MULTI_SEND_BYTECODE.startsWith("0x") ? MULTI_SEND_BYTECODE.substring(2) : MULTI_SEND_BYTECODE) });
        await relayer.sendTransaction({ to: SAFE_SINGLETON_FACTORY_ADDRESS, data: "0x0000000000000000000000000000000000000000000000000000000000000000" + (COMPATIBILITY_FALLBACK_HANDLER_BYTECODE.startsWith("0x") ? COMPATIBILITY_FALLBACK_HANDLER_BYTECODE.substring(2) : COMPATIBILITY_FALLBACK_HANDLER_BYTECODE) });

        // Deploy WaymontSafeFactory
        await relayer.sendTransaction({ to: SAFE_SINGLETON_FACTORY_ADDRESS, data: "0x0000000000000000000000000000000000000000000000000000000000000000" + (WAYMONT_SAFE_FACTORY_BYTECODE.startsWith("0x") ? WAYMONT_SAFE_FACTORY_BYTECODE.substring(2) : WAYMONT_SAFE_FACTORY_BYTECODE) + ethers.utils.defaultAbiCoder.encode(["address"], [WAYMONT_POLICY_GUARDIAN_MANAGER_ADDRESS]).substring(2) });
        const waymontSafeFactoryContract = new ethers.Contract(WAYMONT_SAFE_FACTORY_ADDRESS, WAYMONT_SAFE_FACTORY_ABI);

        // Set policy guardian on WaymontSafePolicyGuardianSigner
        const waymontSafePolicyGuardianSignerContract = new ethers.Contract(WAYMONT_SAFE_POLICY_GUARDIAN_SIGNER_CONTRACT_ADDRESS, WAYMONT_SAFE_POLICY_GUARDIAN_SIGNER_ABI, relayer);
        await relayer.sendTransaction({ to: WAYMONT_POLICY_GUARDIAN_MANAGER_ADDRESS, value: "1000000000000000000" });
        const impersonatedPolicyGuardianManager = await ethers.getImpersonatedSigner(WAYMONT_POLICY_GUARDIAN_MANAGER_ADDRESS);
        const policyGuardian = ethers.Wallet.createRandom();
        await waymontSafePolicyGuardianSignerContract.connect(impersonatedPolicyGuardianManager).setPolicyGuardian(policyGuardian.address);

        // Test on Safe with policy guardian and 3 EOA signers; also test on Safe with policy guardian and advanced signer (with 1 underlying signer, 2 underlying signers, and 3 underlying signers)
        const safeInterface = new ethers.utils.Interface(SAFE_ABI);
        const extraSigners = [ethers.Wallet.createRandom().address, ethers.Wallet.createRandom().address];

        for (let advancedSignerUnderlyingSignerCount = 0; advancedSignerUnderlyingSignerCount <= 3; advancedSignerUnderlyingSignerCount++) {
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
            const safeSaltNonce = advancedSignerUnderlyingSignerCount; // Use advancedSignerUnderlyingSignerCount as safeSaltNonce so deployments don't overlap
            const safeProxyFactory = new ethers.Contract(SAFE_PROXY_FACTORY_ADDRESS, SAFE_PROXY_FACTORY_ABI, relayer);
            await safeProxyFactory.createProxyWithNonce(SAFE_SINGLETON_ADDRESS, safeInitializerData, safeSaltNonce);
            const safeAddress = predictSafeAddress(safeInitializerData, safeSaltNonce);
            const mySafeContract = new ethers.Contract(safeAddress, SAFE_ABI, relayer);

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
                        to: mySafeContract.address,
                        data: mySafeContract.interface.encodeFunctionData("addOwnerWithThreshold", [predictedAdvancedSignerAddress, 2])
                    },
                    {
                        to: waymontSafeFactoryContract.address,
                        data: waymontSafeFactoryContract.interface.encodeFunctionData("createAdvancedSigner", [safeAddress, underlyingSigners, underlyingThreshold, advancedSignerDeploymentNonce])
                    },
                ];

                // Encode MultiSend.multiSend function data
                const multiSendInterface = new ethers.utils.Interface(MULTI_SEND_ABI);

                let packedTransactions = "0x";
                for (const tx of transactions) packedTransactions += ethers.utils.solidityPack(["uint8", "address", "uint256", "uint256", "bytes"], [0, tx.to, 0, ethers.utils.hexDataLength(tx.data), tx.data]).substring(2);

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
                const domainSeparator = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256", "address"], [DOMAIN_SEPARATOR_TYPEHASH, ethers.provider.network.chainId, mySafeContract.address]));

                const encodedTransactionData = ethers.utils.solidityPack(
                    ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
                    ['0x19', '0x01', domainSeparator, safeTxHash],
                );

                const overlyingHash = ethers.utils.keccak256(encodedTransactionData);
                const policyGuardianSignatureUnserialized = policyGuardian._signingKey().signDigest(overlyingHash);
                const policyGuardianSignature = ethers.utils.solidityPack(["bytes32", "bytes32", "uint8"], [policyGuardianSignatureUnserialized.r, policyGuardianSignatureUnserialized.s, policyGuardianSignatureUnserialized.v]);

                // Generate overlying policy guardian smart contract signature
                const policyGuardianOverlyingSignaturePointer = ethers.utils.solidityPack(
                    ["bytes32", "uint256", "uint8"],
                    [
                        ethers.utils.hexZeroPad(WAYMONT_SAFE_POLICY_GUARDIAN_SIGNER_CONTRACT_ADDRESS, 32),
                        65,
                        0
                    ]
                );
                const policyGuardianOverlyingSignatureData = ethers.utils.solidityPack(
                    ["uint256", "bytes"],
                    [
                        65,
                        policyGuardianSignature
                    ]
                );
                const packedOverlyingSignature = ethers.utils.solidityPack(["bytes", "bytes"], [policyGuardianOverlyingSignaturePointer, policyGuardianOverlyingSignatureData]);
            
                // Dispatch TX
                console.log("Submitting Safe.execTransaction (in test.js)...");
                const tx = await mySafeContract.execTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, packedOverlyingSignature);
                console.log("Submitted Safe.execTransaction with transaction hash:", tx.hash);
                console.log("Waiting for confirmations...");
                await tx.wait();
                console.log("Transaction confirmed!", tx.hash);

                // Assert signers on AdvancedSigner are correct
                const myWaymontSafeAdvancedSignerContract = new ethers.Contract(predictedAdvancedSignerAddress, WAYMONT_SAFE_ADVANCED_SIGNER_ABI, relayer);
                const underlyingOwners = await myWaymontSafeAdvancedSignerContract.getOwners();
                assert(underlyingOwners.length == advancedSignerUnderlyingSignerCount && underlyingOwners[0] == myChildWallet.address);
                expect(await myWaymontSafeAdvancedSignerContract.getThreshold()).to.equal(2);

                // Assert signers on Safe are correct
                const safeOwners = await mySafeContract.getOwners();
                assert(safeOwners.length == 2 && safeOwners[0] == waymontSafePolicyGuardianSignerContract.address && safeOwners[1] == predictedAdvancedSignerAddress);
                expect(await mySafeContract.getThreshold()).to.equal(2);
            } else {
                // Assert signers on Safe are correct
                const safeOwners = await mySafeContract.getOwners();
                assert(safeOwners.length == 4 && safeOwners[0] == waymontSafePolicyGuardianSignerContract.address && safeOwners[1] == myChildWallet.address);
                expect(await mySafeContract.getThreshold()).to.equal(2);
            }

            // Generate relayer key
            const relayer2 = ethers.Wallet.createRandom();
            await relayer.sendTransaction({ to: relayer2.address, value: "1000000000000000000" });

            // Fix provider URL in case it tries to resolve localhost to ::1 (IPv6) instead of 127.0.0.1 (IPv4)
            const providerUrl = new URL(ethers.provider.connection.url);
            if (providerUrl.hostname == "localhost") providerUrl.hostname = "127.0.0.1";

            // Run script: initiate-recovery.js
            await runAndWait(__dirname + "/../src/initiate-recovery.js", [
                providerUrl.href,
                safeAddress,
                EXAMPLE_VAULT_SUBKEY_INDEX,
                relayer2._signingKey().privateKey,
                EXAMPLE_ROOT_MNEMONIC_SEED_PHRASE
            ]);
            
            // Assert recovery process has begun
            expect(await waymontSafePolicyGuardianSignerContract.disablePolicyGuardianQueueTimestamps(safeAddress)).to.be.above(0);

            // Wait almost 14 days (evm_increaseTime) and mine block so latest block timestamp is updated so that recovery execution script recognizes time has passed
            await ethers.provider.send("evm_increaseTime", [14 * 86400 - 60]);
            await ethers.provider.send("evm_mine");
        
            // Expect failure running script: execute-recovery.js
            await assert.rejects(runAndWait(__dirname + "/../src/execute-recovery.js", [
                providerUrl.href,
                safeAddress,
                EXAMPLE_VAULT_SUBKEY_INDEX,
                relayer2._signingKey().privateKey,
                EXAMPLE_ROOT_MNEMONIC_SEED_PHRASE
            ]));
        
            // Wait 60 seconds to get to past the full 14-day timelock (evm_increaseTime) and mine block so latest block timestamp is updated so that recovery execution script recognizes time has passed
            await ethers.provider.send("evm_increaseTime", [60]);
            await ethers.provider.send("evm_mine");

            // Run script: execute-recovery.js
            await runAndWait(__dirname + "/../src/execute-recovery.js", [
                providerUrl.href,
                safeAddress,
                EXAMPLE_VAULT_SUBKEY_INDEX,
                relayer2._signingKey().privateKey,
                EXAMPLE_ROOT_MNEMONIC_SEED_PHRASE
            ]);

            // Assert policy guardian signer no longer present and rest of signers are correct
            const safeOwners = await mySafeContract.getOwners();
            assert(safeOwners.length == advancedSignerUnderlyingSignerCount > 0 ? advancedSignerUnderlyingSignerCount : 3 && safeOwners[0] == myChildWallet.address);
            for (const i = 1; i < advancedSignerUnderlyingSignerCount; i++) assert(safeOwners[i] == extraSigners[i - 1]);
        
            // Deploy dummy storage contract and get calldata to store value
            const storageContractFactory = new ethers.ContractFactory(STORAGE_ABI, STORAGE_BYTECODE, relayer);
            const storageContract = await storageContractFactory.deploy();
            const exampleCall1Data = storageContract.interface.encodeFunctionData("store", [5678]);

            // Send ETH to Safe
            await relayer.sendTransaction({ to: safeAddress, value: "1234" });

            // Run script: execute-safe-transactions.js
            await runAndWait(__dirname + "/../src/execute-safe-transactions.js", [
                providerUrl.href,
                safeAddress,
                EXAMPLE_VAULT_SUBKEY_INDEX,
                relayer2._signingKey().privateKey,
                EXAMPLE_ROOT_MNEMONIC_SEED_PHRASE,
                storageContract.address,
                exampleCall1Data,
                "0",
                "0x0000000000000000000000000000000000002222",
                "0x",
                "1234"
            ]);
        
            // Assertions
            expect(await storageContract.retrieve(safeAddress)).to.equal(5678);
            expect(await ethers.provider.getBalance("0x0000000000000000000000000000000000002222")).to.equal(1234);
        }
    });
});
