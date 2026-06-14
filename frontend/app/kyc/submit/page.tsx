'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserNav } from '@/components/nav';
import { Card, Field, Input, Label, Button, Alert, StatusBadge } from '@/components/ui';
import type { SubmitKycInput } from '@/lib/types';

const DOC_TYPES = ['PAN', 'AADHAAR', 'PASSPORT', 'SELFIE', 'ADDRESS_PROOF'];
const CONTENT_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

const selectClass =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none';

export default function SubmitKycPage() {
  const ready = useGuard('user');
  const qc = useQueryClient();

  // ---- profile form ----
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [pan, setPan] = useState('');
  const [aadhaarRef, setAadhaarRef] = useState('');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');

  const submit = useMutation({
    mutationFn: () => {
      const address: Record<string, string> = {};
      if (line1) address.line1 = line1;
      if (city) address.city = city;
      if (state) address.state = state;
      if (pincode) address.pincode = pincode;
      const body: SubmitKycInput = {
        fullName,
        dob,
        pan,
        ...(aadhaarRef ? { aadhaarRef } : {}),
        ...(Object.keys(address).length ? { address } : {}),
      };
      return userApi.submitKyc(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kyc'] });
    },
  });

  // ---- documents ----
  const docs = useQuery({
    queryKey: ['kyc-docs'],
    queryFn: () => userApi.listDocuments(),
    enabled: ready,
  });
  const [docType, setDocType] = useState('PAN');
  const [contentType, setContentType] = useState('image/png');
  const [sha256, setSha256] = useState('');
  const addDoc = useMutation({
    mutationFn: () => userApi.submitDocument({ docType, sha256, contentType }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kyc-docs'] });
      setSha256('');
    },
  });

  if (!ready) return null;
  const digilocker = submit.data?.meta?.digilocker as
    | { authorizationUrl?: string }
    | undefined;

  return (
    <>
      <UserNav />
      <main className="mx-auto max-w-2xl px-4 pb-16">
        <h1 className="mb-4 text-xl font-semibold">Submit KYC</h1>

        <Card className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">Profile</h2>
          {submit.isError && (
            <div className="mb-3">
              <Alert>{errorMessage(submit.error)}</Alert>
            </div>
          )}
          {submit.isSuccess && (
            <div className="mb-3">
              <Alert kind="success">
                Submitted — status <StatusBadge status={submit.data.data.status} />.
                {digilocker?.authorizationUrl ? (
                  <>
                    {' '}
                    DigiLocker consent:{' '}
                    <span className="break-all">{digilocker.authorizationUrl}</span>
                  </>
                ) : null}
              </Alert>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit.mutate();
            }}
          >
            <Field label="Full name">
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </Field>
            <Field label="Date of birth">
              <Input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                required
              />
            </Field>
            <Field label="PAN">
              <Input
                value={pan}
                onChange={(e) => setPan(e.target.value.toUpperCase())}
                placeholder="ABCDE1234F"
                required
              />
            </Field>
            <Field label="Aadhaar reference (tokenized, optional)">
              <Input
                value={aadhaarRef}
                onChange={(e) => setAadhaarRef(e.target.value)}
                placeholder="never the raw 12-digit number"
              />
            </Field>

            <div className="grid grid-cols-2 gap-x-3">
              <Field label="Address line 1">
                <Input value={line1} onChange={(e) => setLine1(e.target.value)} />
              </Field>
              <Field label="City">
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </Field>
              <Field label="State">
                <Input value={state} onChange={(e) => setState(e.target.value)} />
              </Field>
              <Field label="Pincode">
                <Input
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  placeholder="560001"
                />
              </Field>
            </div>

            <Button type="submit" disabled={submit.isPending}>
              {submit.isPending ? 'Submitting…' : 'Submit profile'}
            </Button>
          </form>
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-semibold">Documents</h2>
          {addDoc.isError && (
            <div className="mb-3">
              <Alert>{errorMessage(addDoc.error)}</Alert>
            </div>
          )}
          {addDoc.isSuccess && (
            <div className="mb-3">
              <Alert kind="success">
                Registered. Upload URL (not stored server-side):{' '}
                <span className="break-all">{addDoc.data.data.uploadUrl}</span>
              </Alert>
            </div>
          )}

          <form
            className="mb-4 grid grid-cols-3 gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              addDoc.mutate();
            }}
          >
            <div>
              <Label>Type</Label>
              <select
                className={selectClass}
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
              >
                {DOC_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Content type</Label>
              <select
                className={selectClass}
                value={contentType}
                onChange={(e) => setContentType(e.target.value)}
              >
                {CONTENT_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>SHA-256</Label>
              <Input
                value={sha256}
                onChange={(e) => setSha256(e.target.value)}
                placeholder="64 lowercase hex chars"
              />
            </div>
            <div className="col-span-3">
              <Button type="submit" disabled={addDoc.isPending}>
                {addDoc.isPending ? 'Adding…' : 'Register document'}
              </Button>
            </div>
          </form>

          <ul className="text-sm">
            {docs.data?.data.items.map((d) => (
              <li
                key={d.id}
                className="flex justify-between border-b border-gray-100 py-1"
              >
                <span>{d.docType}</span>
                <StatusBadge status={d.status} />
              </li>
            ))}
            {docs.data && docs.data.data.items.length === 0 && (
              <li className="text-gray-500">No documents yet.</li>
            )}
          </ul>
        </Card>
      </main>
    </>
  );
}
