import { type InputHTMLAttributes, forwardRef, useId } from 'react';
import { cn } from '@/utils/cn';

type InputVariant = 'text' | 'email' | 'password';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: InputVariant;
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ variant = 'text', label, error, className, disabled, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const inputType = variant === 'password' ? 'password' : variant === 'email' ? 'email' : 'text';

    return (
      <div className="flex flex-col gap-1.5">
        {label && <label htmlFor={inputId} className="text-xs font-medium text-text-secondary">{label}</label>}
        <input
          ref={ref}
          id={inputId}
          type={inputType}
          className={cn(
            'w-full px-4 py-2.5 text-sm rounded-lg bg-bg-primary border transition-colors duration-150 outline-none',
            'text-text-primary placeholder:text-text-muted',
            error
              ? 'border-tone-4 focus:border-tone-4'
              : 'border-border-default focus:border-accent',
            disabled && 'opacity-50 cursor-not-allowed',
            className,
          )}
          disabled={disabled}
          {...props}
        />
        {error && <span className="text-xs text-tone-4">{error}</span>}
      </div>
    );
  },
);

Input.displayName = 'Input';

export default Input;
