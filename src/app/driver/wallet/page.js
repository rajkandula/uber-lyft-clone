'use client';

import { Suspense } from 'react';
import WalletPanel from '@/components/wallet/WalletPanel';
import { Loading } from '@/components/ui/bits';

export default function WalletPage() {
  return (
    <Suspense fallback={<div className="content-pad"><Loading /></div>}>
      <WalletPanel />
    </Suspense>
  );
}
