import type { ManagedUser } from "@/hooks/useUsers";
import { UserRow } from "./UserRow";

type UserListProps = {
  users: ManagedUser[];
  currentUsername: string | undefined;
};

export const UserList = ({ users, currentUsername }: UserListProps) => {
  const adminCount = users.filter((u) => u.role === 'admin').length;

  return (
    <ul>
      {users.map((user) => (
        <UserRow
          key={user.id}
          user={user}
          currentUsername={currentUsername}
          isLastAdmin={user.role === 'admin' && adminCount <= 1}
        />
      ))}
    </ul>
  );
};
