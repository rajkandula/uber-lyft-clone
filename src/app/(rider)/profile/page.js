'use client';

import ProfileCard from '@/components/profile/ProfileCard';

export default function RiderProfilePage() {
  return (
    <div className="content-pad" style={{ maxWidth: 640 }}>
      <h1 className="page-title">Profile</h1>
      <p className="page-sub mb-6">Your account details</p>
      <ProfileCard />
    </div>
  );
}
