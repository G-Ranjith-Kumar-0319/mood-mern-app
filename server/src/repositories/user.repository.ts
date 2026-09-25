import type { ClientSession, Types } from 'mongoose';
import { UserModel, type User } from '../models/user.model.js';

export const userRepository = {
  async create(input: {
    email: string;
    passwordHash: string;
    displayName?: string;
  }): Promise<User> {
    const document = await UserModel.create({
      email: input.email,
      passwordHash: input.passwordHash,
      displayName: input.displayName ?? null,
    });
    return document.toObject();
  },

  findById(id: Types.ObjectId | string): Promise<User | null> {
    return UserModel.findById(id).lean<User>().exec();
  },

  /** Includes the password hash — only for credential checks. */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return UserModel.findOne({ email: email.toLowerCase() })
      .select('+passwordHash')
      .lean<User>()
      .exec();
  },

  findByIdWithPassword(id: Types.ObjectId | string): Promise<User | null> {
    return UserModel.findById(id).select('+passwordHash').lean<User>().exec();
  },

  findByEmail(email: string): Promise<User | null> {
    return UserModel.findOne({ email: email.toLowerCase() }).lean<User>().exec();
  },

  /**
   * Sets a new password hash and bumps tokenVersion in one atomic update, so every
   * previously issued refresh token (other devices, a thief) stops working.
   */
  async updatePassword(id: Types.ObjectId, passwordHash: string): Promise<User | null> {
    return UserModel.findByIdAndUpdate(
      id,
      { $set: { passwordHash }, $inc: { tokenVersion: 1 } },
      { returnDocument: 'after' },
    )
      .lean<User>()
      .exec();
  },

  async markEmailVerified(id: Types.ObjectId): Promise<void> {
    await UserModel.updateOne({ _id: id }, { $set: { emailVerified: true } }).exec();
  },

  updateSettings(
    id: Types.ObjectId,
    settings: { retentionDays: number | null },
  ): Promise<User | null> {
    return UserModel.findByIdAndUpdate(id, { $set: settings }, { returnDocument: 'after' })
      .lean<User>()
      .exec();
  },

  async deleteById(id: Types.ObjectId, session?: ClientSession): Promise<void> {
    await UserModel.deleteOne({ _id: id }, { session }).exec();
  },

  /** Atomically bumps the version so all previously issued refresh tokens stop working. */
  async incrementTokenVersion(id: Types.ObjectId | string): Promise<void> {
    await UserModel.updateOne({ _id: id }, { $inc: { tokenVersion: 1 } }).exec();
  },
};
