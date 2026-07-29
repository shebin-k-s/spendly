import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class WebauthnCredential {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    credentialId: string;

    @Column()
    publicKey: string;

    @Column({ type: 'bigint', default: 0 })
    counter: string;

    @Column({ type: 'simple-array', nullable: true })
    transports: string[] | null;

    @Column({ nullable: true })
    deviceName: string;

    @CreateDateColumn()
    createdAt: Date;
}
