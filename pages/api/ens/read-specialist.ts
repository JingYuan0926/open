import type { NextApiRequest, NextApiResponse } from 'next';
import { readSpecialist } from '@/lib/ens-registry';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    const { name } = req.query;
    if (typeof name !== 'string' || !name.includes('.')) {
        return res
            .status(400)
            .json({ success: false, error: 'name query param required (e.g. foo.righthand.eth)' });
    }
    try {
        const result = await readSpecialist(name);
        return res.status(200).json({ success: true, result });
    } catch (err) {
        return res.status(500).json({
            success: false,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}
