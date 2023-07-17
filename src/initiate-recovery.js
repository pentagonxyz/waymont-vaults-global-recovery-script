const assert = require("assert");
const ethers = require("ethers");

// Import ABIs
const SAFE_ABI = require("./abi/Safe.json");
const WAYMONT_SAFE_POLICY_GUARDIAN_SIGNER_ABI = require("./abi/WaymontSafePolicyGuardianSigner.json");
const WAYMONT_SAFE_ADVANCED_SIGNER_ABI = require("./abi/WaymontSafeAdvancedSigner.json");

// Constant addresses and typehashes
const WAYMONT_SAFE_POLICY_GUARDIAN_SIGNER_CONTRACT_ADDRESS = "0x5B34e701393b197d267e6619d01711121F3e87Ce";
const QUEUE_DISABLE_POLICY_GUARDIAN_TYPEHASH = "0xd5fa5ce164fba34243c3b3b9c5346acc2eae6f31655b86516d465566d0ba53f7";
const DOMAIN_SEPARATOR_TYPEHASH = "0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218";
const HD_PATH = "m/44/60/0/0";

// Input validation
assert(process.argv.length == 7, "Invalid number of arguments supplied--you should have exactly 5 arguments.");
assert(process.argv[2].length > 0, "The JSON-RPC provider URL you entered is not valid.");
assert(process.argv[3].length === 42 && process.argv[3].substring(0, 2) === "0x", "The wallet contract address you entered is not valid.");
assert(/^\d+$/.test(process.argv[4]), "The wallet contract deployment nonce you entered is not valid.");
assert(process.argv[5].length === 66 && process.argv[5].substring(0, 2) === "0x", "The funded Ethereum account private key you supplied (for gas fees) is not valid.");
assert(process.argv[6].split(" ").length === 12, "The mnemonic seed phrase you entered is not valid (should be 12 words separated by spaces).");

// Instantiate provider, EOA, and contracts
let myProvider = new ethers.providers.JsonRpcProvider(process.argv[2]);
let myFundedAccountForGas = new ethers.Wallet(process.argv[5], myProvider);
let mySafeContract = new ethers.Contract(process.argv[3], SAFE_ABI, myFundedAccountForGas);
let waymontSafePolicyGuardianSignerContract = new ethers.Contract(WAYMONT_SAFE_POLICY_GUARDIAN_SIGNER_CONTRACT_ADDRESS, WAYMONT_SAFE_POLICY_GUARDIAN_SIGNER_ABI, myFundedAccountForGas);

// Get HD node child signing key for Safe specified by user
const myNode = ethers.utils.HDNode.fromMnemonic(process.argv[6]);
const myChild = myNode.derivePath(HD_PATH + `/${process.argv[4]}`);
const myChildWallet = new ethers.Wallet(myChild.privateKey);
const myChildSigningKey = myChildWallet._signingKey();

// Run async code
(async function() {
    // Validate global WaymontSafePolicyGuardianSigner contract state
    let policyGuardian = await waymontSafePolicyGuardianSignerContract.policyGuardian();
    let policyGuardianPermanentlyDisabled = await waymontSafePolicyGuardianSignerContract.policyGuardianPermanentlyDisabled();
    assert(policyGuardian !== "0x0000000000000000000000000000000000000000" && !policyGuardianPermanentlyDisabled, "Policy guardian has already been disabled by Waymont. Use the recovery execution script instead.");

    // Validate WaymontSafePolicyGuardianSigner contract state for the specified Safe
    let alreadyDisabled = await waymontSafePolicyGuardianSignerContract.policyGuardianDisabled(mySafeContract.address);
    assert(!alreadyDisabled, "Policy guardian has already been disabled on this Safe. Use the recovery execution script instead.");
    let timelock = await waymontSafePolicyGuardianSignerContract.getPolicyGuardianTimelock(mySafeContract.address);
    let queueTimestamp = await waymontSafePolicyGuardianSignerContract.disablePolicyGuardianQueueTimestamps(mySafeContract.address);
    assert(queueTimestamp == 0, queueTimestamp + timelock <= (new Date()).getTime() / 1000 ? "Timelock has already passed. Use the recovery execution script instead." : "Safe recovery has been initiated but timelock has not passed. " + (queueTimestamp + timelock - (new Date()).getTime() / 1000) + " seconds to go.");

    // Ensure Safe threshold == 2
    const safeOwners = await mySafeContract.getOwners();
    assert(await mySafeContract.getThreshold() == 2, "Expected Safe threshold to be 2 but threshold is less than 2. Maybe this Safe has already been recovered?");

    // Ensure Safe has WaymontSafePolicyGuardianSigner as an owner
    let policyGuardianSignerContractFoundOnSafe = false;
    for (const owner of safeOwners) if (owner.toLowerCase() === WAYMONT_SAFE_POLICY_GUARDIAN_SIGNER_CONTRACT_ADDRESS.toLowerCase()) policyGuardianSignerContractFoundOnSafe = true;
    assert(policyGuardianSignerContractFoundOnSafe, "WaymontSafePolicyGuardianSigner contract not found on this Safe. Maybe this Safe has already been recovered?");

    // Check for WaymontSafeAdvancedSigner
    let myWaymontSafeAdvancedSignerContract;

    if (safeOwners.length == 2) {
        const myWaymontSafeAdvancedSignerAddress = safeOwners[0].toLowerCase() === WAYMONT_SAFE_POLICY_GUARDIAN_SIGNER_CONTRACT_ADDRESS.toLowerCase() ? safeOwners[1] : safeOwners[2];

        if ((await myProvider.getCode(myWaymontSafeAdvancedSignerAddress)) !== "0x") {
            myWaymontSafeAdvancedSignerContract = new ethers.Contract(myWaymontSafeAdvancedSignerAddress, WAYMONT_SAFE_ADVANCED_SIGNER_ABI);
            let error, threshold;

            try {
                threshold = await myWaymontSafeAdvancedSignerContract.getThreshold();
            } catch {
                error = true;
            }

            if (error) myWaymontSafeAdvancedSignerContract = undefined;
            else assert(threshold == 1, "Expected WaymontSafeAdvancedSigner threshold to be 1 but threshold is greater than 1. This version of this script does not support multi-signature recovery.");
        }
    }

    // Generate signature for queueDisablePolicyGuardian
    const nonce = await waymontSafePolicyGuardianSignerContract.nonces(mySafeContract.address);
    const underlyingHash = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["bytes32", "address", "uint256"], [QUEUE_DISABLE_POLICY_GUARDIAN_TYPEHASH, mySafeContract.address, nonce]));
    const domainSeparator = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256", "address"], [DOMAIN_SEPARATOR_TYPEHASH, myProvider.network.chainId, waymontSafePolicyGuardianSignerContract.address]));
    const overlyingHash = ethers.utils.keccak256(ethers.utils.solidityPack(["bytes1", "bytes1", "bytes32", "bytes32"], [0x19, 0x01, domainSeparator, underlyingHash]));
    const userSignatureUnserialized = myChildSigningKey.signDigest(overlyingHash);
    const userSignature = ethers.utils.solidityPack(["bytes32", "bytes32", "uint8"], [userSignatureUnserialized.r, userSignatureUnserialized.s, userSignatureUnserialized.v]);

    // Generate dummy overlying policy guardian smart contract signature
    const policyGuardianOverlyingSignaturePointer = ethers.utils.solidityPack(
        ["bytes32", "uint256", "uint8"],
        [
            ethers.utils.hexZeroPad(WAYMONT_SAFE_POLICY_GUARDIAN_SIGNER_CONTRACT_ADDRESS, 32),
            2 * 65,
            0
        ]
    );
    const policyGuardianOverlyingSignatureData = ethers.utils.solidityPack(
        ["uint256", "bytes"],
        [
            65,
            "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
        ]
    );

    // Pack all overlying signatures in correct order (to queue disabling)
    let packedOverlyingSignaturesForQueueing;

    if (myWaymontSafeAdvancedSignerContract === undefined) {
        if (myChildWallet.address.toLowerCase() > waymontSafePolicyGuardianSignerContract.address.toLowerCase()) {
            packedOverlyingSignaturesForQueueing = ethers.utils.solidityPack(
                ["bytes", "bytes", "bytes"],
                [policyGuardianOverlyingSignaturePointer, userSignature, policyGuardianOverlyingSignatureData]
            );
        } else {
            packedOverlyingSignaturesForQueueing = ethers.utils.solidityPack(
                ["bytes", "bytes", "bytes"],
                [userSignature, policyGuardianOverlyingSignaturePointer, policyGuardianOverlyingSignatureData]
            );
        }
    } else {
        // Generate overlying WaymontSafeAdvancedSigner signature (to queue disabling)
        const advancedSignerOverlyingSignaturePointer = ethers.utils.solidityPack(
            ["bytes32", "uint256", "uint8"],
            [
                ethers.utils.hexZeroPad(myWaymontSafeAdvancedSignerContract.address, 32),
                (65 * 2) + 32 + 65,
                0
            ]
        );
        const advancedSignerOverlyingSignatureData = abi.encodePacked(
            ["uint256", "bytes"],
            [
                65,
                userSignature
            ]
        );

        // Pack overlying signatures
        if (myWaymontSafeAdvancedSignerContract.address.toLowerCase() > waymontSafePolicyGuardianSignerContract.address.toLowerCase()) {
            packedOverlyingSignaturesForQueueing = ethers.utils.solidityPack(
                ["bytes", "bytes", "bytes", "bytes"],
                [policyGuardianOverlyingSignaturePointer, advancedSignerOverlyingSignaturePointer, policyGuardianOverlyingSignatureData, advancedSignerOverlyingSignatureData]
            );
        } else {
            packedOverlyingSignaturesForQueueing = ethers.utils.solidityPack(
                ["bytes", "bytes", "bytes", "bytes"],
                [advancedSignerOverlyingSignaturePointer, policyGuardianOverlyingSignaturePointer, policyGuardianOverlyingSignatureData, advancedSignerOverlyingSignatureData]
            );
        }
    }

    // Dispatch TX
    let tx = await waymontSafePolicyGuardianSignerContract.queueDisablePolicyGuardian(mySafeContract.address, packedOverlyingSignaturesForQueueing);
    console.log("Submitted WaymontSafePolicyGuardianSigner.queueDisablePolicyGuardian with transaction hash:", tx.transactionHash);
})();
