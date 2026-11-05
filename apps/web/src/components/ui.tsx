import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300',
  secondary: 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  danger: 'bg-white text-red-700 border border-red-200 hover:bg-red-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
};

export function Button({ variant = 'primary', className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-medium transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 ${className}`}>{children}</div>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  );
}

export const inputClass =
  'rounded-xl border border-slate-300 px-3 py-2.5 text-base text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200';

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{children}</p> : null;
}

export function Screen({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 p-4">{children}</main>;
}
