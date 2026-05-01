import type { NextApiRequest, NextApiResponse } from 'next';
import { isAddress, type Address } from 'viem';
import { registerSpecialist } from '@/lib/ens-registry';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const body = req.body ?? {};
    const { label, records, owner } = body as {
        label?: string;
        owner?: string;
        records?: {
            axlPubkey?: string;
            skills?: string;
            workspaceUri?: string;
            tokenId?: string;
            price?: string;
            version?: string;
        };
    };

    if (typeof label !== 'string' || !label) {
        return res.status(400).json({ success: false, error: 'label is required' });
    }
    if (!records || typeof records !== 'object') {
        return res.status(400).json({ success: false, error: 'records is required' });
    }
    const required = ['axlPubkey', 'skills', 'workspaceUri', 'tokenId', 'price', 'version'] as const;
    for (const key of required) {
        if (typeof records[key] !== 'string') {
            return res.status(400).json({ success: false, error: `records.${key} must be a string` });
        }
    }
    if (owner !== undefined && (typeof owner !== 'string' || !isAddress(owner))) {
        return res.status(400).json({ success: false, error: 'owner must be a valid address' });
    }

    try {
        const result = await registerSpecialist({
            label,
            owner: owner as Address | undefined,
            records: {
                axlPubkey: records.axlPubkey!,
                skills: records.skills!,
                workspaceUri: records.workspaceUri!,
                tokenId: records.tokenId!,
                price: records.price!,
                version: records.version!,
            },
        });
        return res.status(200).json({ success: true, result });
    } catch (err) {
        return res.status(500).json({
            success: false,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}
