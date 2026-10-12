'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormField, TextInput } from '@/components/form-bits';

export function VerifyForm() {
  const router = useRouter();
  const [code, setCode] = useState('');
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const c = code.trim().toUpperCase();
        if (c) router.push(`/verify/${encodeURIComponent(c)}`);
      }}
    >
      <FormField label="Certificate number" required>
        {(id) => <TextInput id={id} value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. SPC-26-000123" autoCapitalize="characters" required />}
      </FormField>
      <button type="submit" className="min-h-12 bg-accent px-6 text-white hover:bg-accent-hover">Verify</button>
    </form>
  );
}
