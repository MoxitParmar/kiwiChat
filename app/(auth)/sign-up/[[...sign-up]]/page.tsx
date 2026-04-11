import SignUp1 from '@/components/auth/sign-up-1'


const page = () => {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignUp1 enabledOAuthStrategies={["oauth_google", "oauth_github"]} />
    </div>
  )
}

export default page