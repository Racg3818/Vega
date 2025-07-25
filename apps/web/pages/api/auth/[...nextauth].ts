import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
	  async jwt({ token, account }) {
		if (account) {
		  token.accessToken = account.access_token;
		}
		return token;
	  },
	  async session({ session, token }) {
		session.accessToken = token.accessToken;
		return session;
	  }
	},
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: '/', // Redireciona para a landing page
  },
};

export default NextAuth(authOptions);

