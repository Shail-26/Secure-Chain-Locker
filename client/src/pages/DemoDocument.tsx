import React, { useState, useEffect } from 'react';
import { Grid, List, Trash2, FileText } from 'lucide-react';
import { useWallet } from '../contexts/WalletContext';
import { Contract, ethers } from 'ethers';
import { ContractAbi, CONTRACT_ADDRESS } from '../contract_info.jsx';

interface Document {
    fileHash: string;
    filename: string;
    metadataCID: string;
    timestamp: number;
    status: 'Active' | 'Revoked' | 'Deleted';
    url: string;
}

export function MyDocuments() {
    const [viewType, setViewType] = useState<'grid' | 'list'>('grid');
    const [documents, setDocuments] = useState<Document[]>([]);
    const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
    const { walletAddress, provider, refreshFiles } = useWallet();
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (walletAddress && provider) {
            fetchUserFiles();
        }
    }, [walletAddress, provider,refreshFiles]);

    const fetchUserFiles = async () => {
        setIsLoading(true);
        try {
            const contract = new Contract(CONTRACT_ADDRESS, ContractAbi, provider);
            const metadataCIDs = await contract.getUserFiles(walletAddress); // Get stored metadata CIDs
    
            const docs: Document[] = [];
    
            for (const metadataCID of metadataCIDs) {
                try {
                    // Fetch metadata from IPFS
                    const metadataUrl = `https://gateway.pinata.cloud/ipfs/${metadataCID}`;
                    const response = await fetch(metadataUrl);
                    
                    if (!response.ok) throw new Error(`Failed to fetch metadata from IPFS: ${metadataCID}`);
                    
                    const metadata = await response.json(); // Metadata contains fileHash & filename
                    console.log("metadata", metadata)
    
                    const { fileHash, fileName, timestamp } = metadata; // Ensure metadata includes timestamp
                    console.log(fileName)
    
                    // Fetch credential status from contract
                    const [isValid, issuer, receiver] = await contract.verifyCredential(metadataCID);
                    const details = await contract.getCredentialDetails(metadataCID, []); // Fetch credential details
    
                    const status = !isValid ? (details.isDeleted ? 'Deleted' : 'Revoked') : 'Active';
    
                    // Construct document object
                    docs.push({
                        fileHash: fileHash,
                        filename: fileName,
                        metadataCID: metadataCID,
                        timestamp: timestamp ? Number(timestamp) * 1000 : Date.now(), // Convert timestamp to ms
                        status: status,
                        url: `https://gateway.pinata.cloud/ipfs/${fileHash}`,
                    });
                    console.log(docs)
                } catch (innerError) {
                    console.warn(`Skipping metadataCID ${metadataCID} due to error:`, innerError);
                    continue; // Skip this file if fetching failed
                }
            }
    
            setDocuments(docs);
        } catch (error) {
            console.error("Error fetching documents:", error);
        } finally {
            setIsLoading(false);
        }
    };
        

    const handleDelete = async (doc: Document) => {
        if (!window.confirm(`Are you sure you want to delete this document (${doc.fileHash})?`)) return;

        try {
            if (!provider) throw new Error('Provider not available');
            const signer = await provider.getSigner();
            const contract = new Contract(CONTRACT_ADDRESS, ContractAbi, signer);
            const tx = await contract.deleteFile(doc.metadataCID);

            console.log('Transaction submitted:', tx.hash);
            await tx.wait();

            setDocuments(prevDocs => prevDocs.filter(d => d.fileHash !== doc.fileHash));
            console.log('Deleted successfully:', doc.fileHash);
        } catch (error) {
            console.error('Error deleting document:', error);
        }
    };

    const getFileIcon = (metadata: string) => {
        // Placeholder: Determine file type from metadata or fileHash if needed
        return <FileText className="w-6 h-6" />;
    };

    return (
        <div className="page-transition pt-16">
            <section className="py-12 bg-gradient-to-br from-indigo-500/10 to-purple-500/10">
                <div className="max-w-7xl mx-auto px-4">
                    <h1 className="text-4xl font-bold text-center">My Documents</h1>
                    <p className="text-center">Manage all your secure documents in one place</p>
                </div>
            </section>

            <section className="py-12 bg-white">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="flex justify-between mb-8">
                        <div className="flex items-center space-x-4">
                            <button onClick={() => setViewType('grid')} className="p-2 rounded-lg bg-gray-100">
                                <Grid className="w-5 h-5" />
                            </button>
                            <button onClick={() => setViewType('list')} className="p-2 rounded-lg bg-gray-100">
                                <List className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="flex justify-center py-8">
                            <svg className="animate-spin h-8 w-8 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        </div>
                    ) : documents.length === 0 ? (
                        <p className="text-center py-8 text-gray-500">No documents found</p>
                    ) : viewType === 'grid' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                            {documents.map((doc) => {
                                let parsedMetadata;
                                try {
                                    parsedMetadata = JSON.parse(doc.metadata);
                                } catch (e) {
                                    parsedMetadata = { error: "Invalid Metadata" };
                                }

                                return (
                                    <div key={doc.fileHash} className="card p-4 border rounded cursor-pointer hover:shadow-lg" onClick={() => setSelectedDoc(doc)}>
                                        {getFileIcon(doc.metadata)}
                                        <p className="font-medium truncate">{parsedMetadata.name || doc.filename}</p>
                                        <p className="text-gray-500">Modified: {new Date(doc.timestamp).toLocaleString()}</p>
                                        <p className={`text-sm ${doc.status === 'Active' ? 'text-green-600' : 'text-red-600'}`}>{doc.status}</p>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(doc); }}
                                            className="text-red-500 hover:text-red-700 mt-2"
                                            disabled={doc.status !== 'Active'}
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead>
                                <tr>
                                    <th className="pb-3 text-left">File</th>
                                    <th className="pb-3 text-left">Modified</th>
                                    <th className="pb-3 text-left">Status</th>
                                    <th className="pb-3 text-left">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {documents.map((doc) => {
                                    let parsedMetadata;
                                    try {
                                        parsedMetadata = JSON.parse(doc.metadata);
                                    } catch (e) {
                                        parsedMetadata = { error: "Invalid Metadata" };
                                    }

                                    return (
                                        <tr key={doc.fileHash} onClick={() => setSelectedDoc(doc)} className="hover:bg-gray-100">
                                            <td className="py-4 flex items-center">
                                                {getFileIcon(doc.metadata)}
                                                <span className="ml-2 truncate max-w-[200px]">{parsedMetadata.name || doc.filename}</span>
                                            </td>
                                            <td className="py-4">{new Date(doc.timestamp).toLocaleString()}</td>
                                            <td className="py-4">
                                                <span className={`${doc.status === 'Active' ? 'text-green-600' : 'text-red-600'}`}>{doc.status}</span>
                                            </td>
                                            <td className="py-4">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDelete(doc); }}
                                                    className="text-red-500 hover:text-red-700"
                                                    disabled={doc.status !== 'Active'}
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </section>

            {selectedDoc && (
                <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
                    <div className="bg-white p-6 rounded shadow-lg max-w-2xl w-full">
                        <h3 className="text-xl font-bold mb-4">Document Preview</h3>
                        <p><strong>File Name:</strong> {selectedDoc.filename}</p>
                        <p><strong>IPFS Hash:</strong> {selectedDoc.fileHash}</p>
                        <p><strong>Status:</strong> {selectedDoc.status}</p>
                        <p><strong>Last Modified:</strong> {new Date(selectedDoc.timestamp).toLocaleString()}</p>

                        <div className="mt-4">
                        <a
                            href={selectedDoc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 underline font-semibold"
                        >
                            Open Document in New Tab
                        </a>
                    </div>

                        <button className="mt-4 bg-red-500 text-white px-4 py-2 rounded" onClick={() => setSelectedDoc(null)}>
                            Close
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
}