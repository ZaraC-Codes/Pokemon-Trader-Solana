// src/hooks/useMysteryBox.ts
import { useWriteContract, useReadContract } from 'wagmi';
import { useActiveWeb3React } from "./useActiveWeb3React";
import { apeChainMainnet } from '../services/apechainConfig';

export const MYSTERY_BOX_ABI = [
	{
		"inputs": [],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "owner",
				"type": "address"
			}
		],
		"name": "OwnableInvalidOwner",
		"type": "error"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "account",
				"type": "address"
			}
		],
		"name": "OwnableUnauthorizedAccount",
		"type": "error"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "uint256",
				"name": "listingId",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "address",
				"name": "collection",
				"type": "address"
			}
		],
		"name": "MysteryBoxAdded",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "uint256",
				"name": "listingId",
				"type": "uint256"
			}
		],
		"name": "MysteryBoxRemoved",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "previousOwner",
				"type": "address"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "newOwner",
				"type": "address"
			}
		],
		"name": "OwnershipTransferred",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "listingId",
				"type": "uint256"
			},
			{
				"internalType": "address",
				"name": "collection",
				"type": "address"
			}
		],
		"name": "addMysteryBox",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "listingId",
				"type": "uint256"
			}
		],
		"name": "getMysteryBox",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"name": "mysteryBoxes",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "owner",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "listingId",
				"type": "uint256"
			}
		],
		"name": "removeMysteryBox",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "renounceOwnership",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "newOwner",
				"type": "address"
			}
		],
		"name": "transferOwnership",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	}
];

export const MYSTERY_BOX_ADDRESS = process.env.REACT_APP_MYSTERY_BOX_ADDRESS;

export const useMysteryBox = (listingId?: number, externalStatus?: boolean | null) => {
	const { writeContractAsync } = useWriteContract();
	const { publicClient } = useActiveWeb3React();

	const { data: collection, isLoading } = useReadContract({
		address: MYSTERY_BOX_ADDRESS as `0x${string}`,
		abi: MYSTERY_BOX_ABI,
		functionName: 'getMysteryBox',
		args: listingId ? [BigInt(listingId)] : undefined,
		chainId: apeChainMainnet.id,
	});

	const markAsMystery = async (listingId: number, value: boolean, collection: string) => {
		const tx = await writeContractAsync({
			abi: MYSTERY_BOX_ABI,
			address: MYSTERY_BOX_ADDRESS as `0x${string}`,
			functionName: value ? "addMysteryBox" : "removeMysteryBox",
			args: value ? [BigInt(listingId), collection] : [BigInt(listingId)],
			chainId: apeChainMainnet.id,
		});

		await publicClient?.waitForTransactionReceipt({ hash: tx });
		return tx;
	};

	// Use external status if provided (from Marketplace bulk fetch), otherwise use hook result
	const isMystery = externalStatus !== undefined && externalStatus !== null
		? externalStatus
		: !!collection && collection !== '0x0000000000000000000000000000000000000000';
	
	const isStatusKnown = externalStatus !== undefined && externalStatus !== null || !isLoading;

	return {
		isMystery,
		isStatusKnown,
		isLoading: isLoading && externalStatus === undefined,
		collection: collection || '',
		markAsMystery,
	};
};