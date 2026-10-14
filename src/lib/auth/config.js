import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/db/mongodb';
import User from '@/lib/db/models/User';

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    CredentialsProvider({
      id: 'credentials',
      name: 'Username & Password',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          throw new Error('Username and password are required');
        }

        await connectDB();

        const user = await User.findOne({
          username: String(credentials.username).toLowerCase().trim(),
        }).select('+passwordHash');

        if (!user || !user.passwordHash) {
          throw new Error('Invalid username or password');
        }

        const valid = await bcrypt.compare(String(credentials.password), user.passwordHash);
        if (!valid) {
          throw new Error('Invalid username or password');
        }

        if (!user.isActive) {
          throw new Error('This account has been deactivated');
        }

        user.lastLoginAt = new Date();
        await user.save();

        return {
          id: user._id.toString(),
          username: user.username,
          name: user.name,
          role: user.role,
          avatar: user.avatar,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/login',
    newUser: '/signup',
    error: '/login',
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.username = user.username;
        token.avatar = user.avatar;
      }

      if (trigger === 'update' && session) {
        token.name = session.name || token.name;
        token.role = session.role || token.role;
        token.avatar = session.avatar ?? token.avatar;
      }

      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.username = token.username;
        session.user.avatar = token.avatar;
      }
      return session;
    },
  },
});
