import { useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";

import { authClient } from "@kan/auth/client";

import Button from "~/components/Button";
import Input from "~/components/Input";
import { usePopup } from "~/providers/popup";
import type { AuthFormValues } from "~/components/auth-form-i18n";
import {
  createSignInSchema,
  createSignUpSchema,
  getAuthErrorMessage,
} from "~/components/auth-form-i18n";

interface AuthProps {
  isSignUp?: boolean;
}

export function Auth({ isSignUp }: AuthProps) {
  const [isLoginPending, setIsLoginPending] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const { showPopup } = usePopup();
  const { i18n } = useLingui();
  const router = useRouter();
  const ALLOWED_REDIRECTS = ["/boards", "/reports"];

  const redirect = useSearchParams().get("next");
  const callbackURL =
    redirect && ALLOWED_REDIRECTS.includes(redirect)
      ? redirect
      : "/boards";
  const schema = isSignUp
    ? createSignUpSchema(i18n)
    : createSignInSchema(i18n);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AuthFormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (values: AuthFormValues) => {
    setIsLoginPending(true);
    setLoginError(null);

    if (isSignUp) {
      // @ts-ignore - Custom endpoint
      const { error } = await authClient.signUpUsername(
        {
          username: values.username,
          password: values.password!,
          name: values.name || values.username,
          email: values.email,
          emailVerified: true,
          callbackURL,
        },
        {
          onSuccess: () =>{
            showPopup({
              header: t`Success`,
              message: t`You have been signed up successfully.`,
              icon: "success",
            }),
            router.push(callbackURL);
          },
          onError: (ctx: { error: { message?: string } }) =>
            setLoginError(getAuthErrorMessage(i18n, ctx.error.message)),
        },
      );
      if (error) setLoginError(getAuthErrorMessage(i18n, error.message));
    } else {
      // @ts-ignore - Better Auth plugin inference issue in monorepo
      const { error } = await authClient.signInUsername(
        {
          username: values.username,
          password: values.password!,
          callbackURL,
        },
        {
          onSuccess: () =>{
            showPopup({
              header: t`Success`,
              message: t`You have been logged in successfully.`,
              icon: "success",
            }),
            window.location.href = callbackURL;
          },
          onError: (ctx: { error: { message?: string } }) =>
            setLoginError(getAuthErrorMessage(i18n, ctx.error.message)),
        },
      );
      if (error) setLoginError(getAuthErrorMessage(i18n, error.message));
    }

    setIsLoginPending(false);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-2">
          {isSignUp && (
            <div>
              <div>
                <Input
                  {...register("name")}
                  placeholder={t`Enter your name`}
                />
                {errors.name && (
                  <p className="mt-2 text-xs text-red-400">
                    {errors.name.message}
                  </p>
                )}
              </div>
              <div className="mt-2">
                <Input
                  {...register("email")}
                  placeholder={t`Enter your email`}
                />
                {errors.email && (
                  <p className="mt-2 text-xs text-red-400">
                    {errors.email.message}
                  </p>
                )}
              </div>
            </div>
          )}
          <div>
            <Input
              {...register("username")}
              placeholder={t`Enter your username`}
            />
            {errors.username && (
              <p className="mt-2 text-xs text-red-400">
                {errors.username.message}
              </p>
            )}
          </div>

          <div>
            <Input
              type="password"
              {...register("password")}
              placeholder={t`Enter your password`}
            />
            {errors.password && (
              <p className="mt-2 text-xs text-red-400">
                {errors.password.message}
              </p>
            )}
          </div>
          {loginError && (
            <p className="mt-2 text-xs text-red-400">{loginError}</p>
          )}
        </div>
        <div className="mt-[1.5rem] flex items-center gap-4">
          <Button
            isLoading={isLoginPending}
            fullWidth
            size="lg"
            variant="secondary"
          >
            {isSignUp ? t`Sign up` : t`Login`}
          </Button>
        </div>
      </form>
    </div>
  );
}
