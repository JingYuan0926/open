import type { NextApiRequest, NextApiResponse } from 'next';
import { getRegistrarStatus } from '@/lib/ens-registry';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    try {
        const status = await getRegistrarStatus();
        return res.status(200).json({ success: true, status });
    } catch (err) {
        return res.status(500).json({
            success: false,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}
