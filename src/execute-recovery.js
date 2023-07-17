const assert = require("assert");
const ethers = require("ethers");

// Import ABIs
const SAFE_ABI = require("./abi/Safe.json");
const WAYMONT_SAFE_POLICY_GUARDIAN_SIGNER_ABI = require("./abi/WaymontSafePolicyGuardianSigner.json");
const WAYMONT_SAFE_ADVANCED_SIGNER_ABI = require("./abi/WaymontSafeAdvancedSigner.json");
const MULTI_SEND_ABI = require("./abi/MultiSend.json");

// Constant addresses and typehashes
const WAYMONT_SAFE_POLICY_GUARDIAN_SIGNER_CONTRACT_ADDRESS = "0x5B34e701393b197d267e6619d01711121F3e87Ce";
const MULTI_SEND_ADDRESS = "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526";
const DISABLE_POLICY_GUARDIAN_TYPEHASH = "0x1fa738809572ae202e6e8b28ae7d08f5972c3ae85e70f8bc386515bb47925975";
const DOMAIN_SEPARATOR_TYPEHASH = "0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218";
const SAFE_TX_TYPEHASH = "0xbb8310d486368db6bd6f849402fdd73ad53d316b5a4b2644ad6efe0f941286d8";
const HD_PATH = "m/44/60/0/0";

assert(process.argv.length == 7, "Incorrect number of arguments supplied.");
assert(process.argv[2].length > 0, "The JSON-RPC provider URL you entered is not valid.");
assert(process.argv[3].length === 42 && process.argv[3].substring(0, 2) === "0x", "The wallet contract address you entered is not valid.");
assert(/^\d+$/.test(process.argv[4]), "The vault subkey index you entered is not valid.");
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
    // Ensure Safe threshold == 2
    const safeOwners = await mySafeContract.getOwners();
    assert(await mySafeContract.getThreshold() == 2, "Expected Safe threshold to be 2 but threshold is less than 2. Maybe this Safe has already been recovered?");

    // Ensure Safe has WaymontSafePolicyGuardianSigner as an owner
    let policyGuardianSignerContractFoundOnSafe = false;
    for (const owner of safeOwners) if (owner.toLowerCase() === WAYMONT_SAFE_POLICY_GUARDIAN_SIGNER_CONTRACT_ADDRESS.toLowerCase()) policyGuardianSignerContractFoundOnSafe = true;
    assert(policyGuardianSignerContractFoundOnSafe, "WaymontSafePolicyGuardianSigner contract not found on this Safe. Maybe this safe has already been recovered?");

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

    // Ensure Safe has signer as an owner
    if (myWaymontSafeAdvancedSignerContract !== undefined) {
        const underlyingOwners = await myWaymontSafeAdvancedSignerContract.getOwners();
        let userSignerFoundOnSafe = false;
        for (const owner of underlyingOwners) if (owner.toLowerCase() === myChildWallet.address.toLowerCase()) userSignerFoundOnSafe = true;
        assert(userSignerFoundOnSafe, "Supplied signing key not found on the specified Safe. Please sure yout input parameters are correct.");
    } else {
        let userSignerFoundOnSafe = false;
        for (const owner of safeOwners) if (owner.toLowerCase() === myChildWallet.address.toLowerCase()) userSignerFoundOnSafe = true;
        assert(userSignerFoundOnSafe, "Supplied signing key not found on the specified Safe. Please sure yout input parameters are correct.");
    }

    // Validate global WaymontSafePolicyGuardianSigner contract state
    const policyGuardian = await waymontSafePolicyGuardianSignerContract.policyGuardian();
    const policyGuardianPermanentlyDisabled = await waymontSafePolicyGuardianSignerContract.policyGuardianPermanentlyDisabled();

    if (policyGuardian !== "0x0000000000000000000000000000000000000000" && !policyGuardianPermanentlyDisabled) {
        // Validate WaymontSafePolicyGuardianSigner contract state for the specified Safe
        const alreadyDisabled = await waymontSafePolicyGuardianSignerContract.policyGuardianDisabled(mySafeContract.address);

        if (!alreadyDisabled) {
            const timelock = await waymontSafePolicyGuardianSignerContract.getPolicyGuardianTimelock(mySafeContract.address);
            const queueTimestamp = await waymontSafePolicyGuardianSignerContract.disablePolicyGuardianQueueTimestamps(mySafeContract.address);
            assert(queueTimestamp > 0, "Wallet recovery has not been initiated. Please run the intiation script first.");
            assert(queueTimestamp + timelock <= (new Date()).getTime() / 1000, "Timelock has not yet passed, though wallet recovery has been initiated.");

            // Generate signature for queueDisablePolicyGuardian
            const nonce = (await waymontSafePolicyGuardianSignerContract.nonces(mySafeContract.address)) + 1;
            const underlyingHash = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["bytes32", "address", "uint256"], [DISABLE_POLICY_GUARDIAN_TYPEHASH, mySafeContract.address, nonce]));
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

            // Generate overlying WaymontSafeAdvancedSigner signature
            const advancedSignerOverlyingSignaturePointer = ethers.utils.solidityPack(
                ["bytes32", "uint256", "uint8"],
                [
                    ethers.utils.hexZeroPad(myWaymontSafeAdvancedSignerContract.address, 32),
                    (65 * 2) + 32 + 65,
                    0
                ]
            );
            const advancedSignerOverlyingSignatureData = ethers.utils.solidityPack(
                ["uint256", "bytes"],
                [
                    65 * 2,
                    userSignature
                ]
            );

            // Pack all overlying signatures in correct order
            let packedOverlyingSignatures;

            if (myWaymontSafeAdvancedSignerContract === undefined) {
                packedOverlyingSignatures = ethers.utils.solidityPack(
                    ["bytes", "bytes", "bytes"],
                    [policyGuardianOverlyingSignaturePointer, userSignature, policyGuardianOverlyingSignatureData]
                );
            } else if (myWaymontSafeAdvancedSignerContract.address.toLowerCase() > waymontSafePolicyGuardianSignerContract.address.toLowerCase()) {
                packedOverlyingSignatures = ethers.utils.solidityPack(
                    ["bytes", "bytes", "bytes", "bytes"],
                    [policyGuardianOverlyingSignaturePointer, advancedSignerOverlyingSignaturePointer, policyGuardianOverlyingSignatureData, advancedSignerOverlyingSignatureData]
                );
            } else {
                packedOverlyingSignatures = ethers.utils.solidityPack(
                    ["bytes", "bytes", "bytes", "bytes"],
                    [advancedSignerOverlyingSignaturePointer, policyGuardianOverlyingSignaturePointer, policyGuardianOverlyingSignatureData, advancedSignerOverlyingSignatureData]
                );
            }

            // Dispatch TX
            let tx = await waymontSafePolicyGuardianSignerContract.disablePolicyGuardianWithoutPolicyGuardian(mySafeContract.address, packedOverlyingSignatures);
            console.log("Submitted WaymontSafePolicyGuardianSigner.disablePolicyGuardianWithoutPolicyGuardian with transaction hash:", tx.transactionHash);
        }
    }

    // Generate transactions to send: swap out WaymontSafePolicyGuardianSigner contract and WaymontSafeAdvancedSigner contract for raw underlying user signing devices
    let transactions;

    if (myWaymontSafeAdvancedSignerContract !== undefined) {
        // 2 signers on Safe to be removed (WaymontSafePolicyGuardianSigner and WaymontSafeAdvancedSigner)--and threshold should be changed from 2 to 1--and signers should be shifted
        const underlyingOwners = await myWaymontSafeAdvancedSignerContract.getOwners();
        const policyGuardianSignerContractIsFirstOwnerInLinkedList = safeOwners[0].toLowerCase() === WAYMONT_SAFE_POLICY_GUARDIAN_SIGNER_CONTRACT_ADDRESS.toLowerCase();
        assert((policyGuardianSignerContractIsFirstOwnerInLinkedList ? safeOwners[1] : safeOwners[0]).toLowerCase() === myWaymontSafeAdvancedSignerContract.address.toLowerCase(), "Unexpected error when checking if WaymontSafePolicyGuardianSigner contract is first signer in linked list of Safe owners");

        if (underlyingOwners.length > 2) {
            // Swap WaymontSafePolicyGuardianSigner for underlyingOwners[0], swap WaymontSafeAdvancedSigner for underlyingOwners[1], and add the rest of underlyingOwners (setting threshold to 1)
            transactions = [
                {
                    to: mySafeContract.address,
                    data: mySafeContract.interface.encodeFunctionData(
                        "swapOwner",
                        [
                            policyGuardianSignerContractIsFirstOwnerInLinkedList ? "0x0000000000000000000000000000000000000001" : safeOwners[0],
                            WAYMONT_SAFE_POLICY_GUARDIAN_SIGNER_CONTRACT_ADDRESS,
                            underlyingOwners[0]
                        ]
                    )
                },
                {
                    to: mySafeContract.address,
                    data: mySafeContract.interface.encodeFunctionData(
                        "swapOwner",
                        [
                            policyGuardianSignerContractIsFirstOwnerInLinkedList ? safeOwners[0] : "0x0000000000000000000000000000000000000001",
                            myWaymontSafeAdvancedSignerContract.address,
                            underlyingOwners[1]
                        ]
                    )
                }
            ];
            for (let i = 2; i < underlyingOwners.length; i++) transactions.push({
                to: mySafeContract.address,
                data: mySafeContract.interface.encodeFunctionData("addOwnerWithThreshold", [underlyingOwners[i], 1])
            });
        } else if (underlyingOwners.length == 2) {
            // Swap WaymontSafePolicyGuardianSigner for underlyingOwners[0], set threshold to 1, and swap WaymontSafeAdvancedSigner for underlyingOwners[1]
            transactions = [
                {
                    to: mySafeContract.address,
                    data: mySafeContract.interface.encodeFunctionData(
                        "swapOwner",
                        [
                            policyGuardianSignerContractIsFirstOwnerInLinkedList ? "0x0000000000000000000000000000000000000001" : safeOwners[0],
                            WAYMONT_SAFE_POLICY_GUARDIAN_SIGNER_CONTRACT_ADDRESS,
                            underlyingOwners[0]
                        ]
                    )
                },
                {
                    to: mySafeContract.address,
                    data: mySafeContract.interface.encodeFunctionData("changeThreshold", [1])
                },
                {
                    to: mySafeContract.address,
                    data: mySafeContract.interface.encodeFunctionData(
                        "swapOwner",
                        [
                            policyGuardianSignerContractIsFirstOwnerInLinkedList ? safeOwners[0] : "0x0000000000000000000000000000000000000001",
                            myWaymontSafeAdvancedSignerContract.address,
                            underlyingOwners[1]
                        ]
                    )
                }
            ];
        } else if (underlyingOwners.length == 1) {
            // Remove WaymontSafePolicyGuardianSigner (setting threshold to 1) and swap WaymontSafeAdvancedSigner for underlyingOwners[0]
            transactions = [
                {
                    to: mySafeContract.address,
                    data: mySafeContract.interface.encodeFunctionData(
                        "removeOwner",
                        [
                            policyGuardianSignerContractIsFirstOwnerInLinkedList ? "0x0000000000000000000000000000000000000001" : safeOwners[0],
                            WAYMONT_SAFE_POLICY_GUARDIAN_SIGNER_CONTRACT_ADDRESS,
                            1
                        ]
                    )
                },
                {
                    to: mySafeContract.address,
                    data: mySafeContract.interface.encodeFunctionData(
                        "swapOwner",
                        [
                            "0x0000000000000000000000000000000000000001",
                            myWaymontSafeAdvancedSignerContract.address,
                            underlyingOwners[0]
                        ]
                    )
                }
            ];
        } else throw "Unexpected error when checking WaymontSafeAdvancedSigner.getOwners";
    } else {
        // Simply remove the WaymontSafePolicyGuardianSigner (setting threshold to 1)
        let prevOwner;
        for (let i = 0; i < safeOwners.length; i++) if (safeOwners[i].toLowerCase() === WAYMONT_SAFE_POLICY_GUARDIAN_SIGNER_CONTRACT_ADDRESS.toLowerCase()) {
            prevOwner = i == 0 ? "0x0000000000000000000000000000000000000001" : safeOwners[i - 1];
            break;
        }
        assert(prevOwner !== undefined, "Unexpected error when getting prevOwner param for Safe.removeOwner");
        transactions = [
            {
                to: mySafeContract.address,
                data: mySafeContract.interface.removeOwner(prevOwner, WAYMONT_SAFE_POLICY_GUARDIAN_SIGNER_CONTRACT_ADDRESS, 1)
            }
        ];
    }

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
    const nonce = mySafeContract.nonce();

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

    // Pack all overlying signatures in correct order
    let packedOverlyingSignatures;

    if (myWaymontSafeAdvancedSignerContract === undefined) {
        packedOverlyingSignatures = ethers.utils.solidityPack(
            ["bytes", "bytes", "bytes"],
            [policyGuardianOverlyingSignaturePointer, userSignature, policyGuardianOverlyingSignatureData]
        );
    } else {
        // Generate overlying WaymontSafeAdvancedSigner signature
        const advancedSignerOverlyingSignaturePointer = ethers.utils.solidityPack(
            ["bytes32", "uint256", "uint8"],
            [
                ethers.utils.hexZeroPad(myWaymontSafeAdvancedSignerContract.address, 32),
                (65 * 2) + 32 + 65,
                0
            ]
        );
        const advancedSignerOverlyingSignatureData = ethers.utils.solidityPack(
            ["uint256", "bytes"],
            [
                65 * 2,
                userSignature
            ]
        );

        // Pack overlying signatures
        if (myWaymontSafeAdvancedSignerContract.address.toLowerCase() > waymontSafePolicyGuardianSignerContract.address.toLowerCase()) {
            packedOverlyingSignatures = ethers.utils.solidityPack(
                ["bytes", "bytes", "bytes", "bytes"],
                [policyGuardianOverlyingSignaturePointer, advancedSignerOverlyingSignaturePointer, policyGuardianOverlyingSignatureData, advancedSignerOverlyingSignatureData]
            );
        } else {
            packedOverlyingSignatures = ethers.utils.solidityPack(
                ["bytes", "bytes", "bytes", "bytes"],
                [advancedSignerOverlyingSignaturePointer, policyGuardianOverlyingSignaturePointer, policyGuardianOverlyingSignatureData, advancedSignerOverlyingSignatureData]
            );
        }
    }

    // Dispatch TX
    const tx = await mySafeContract.execTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, packedOverlyingSignatures);
    console.log("Submitted Safe.execTransaction with transaction hash:", tx.transactionHash);
})();
