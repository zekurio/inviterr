package postgres

import (
	"database/sql"
	"fmt"

	_ "github.com/lib/pq"

	"github.com/charmbracelet/log"
	"github.com/pressly/goose/v3"
	"github.com/sarulabs/di/v2"
	"github.com/zekurio/inviterr/internal/embedded"
	"github.com/zekurio/inviterr/internal/models"
	"github.com/zekurio/inviterr/internal/services/database"
	"github.com/zekurio/inviterr/internal/util/static"
)

type Postgres struct {
	db *sql.DB
}

var _ database.Database = (*Postgres)(nil)

func New(ctn di.Container) (*Postgres, error) {
	var (
		t   Postgres
		err error
	)

	cfg := ctn.Get(static.DiConfig).(models.Config)
	log := ctn.Get(static.DiLogger).(*log.Logger)
	c := cfg.Database.Postgres

	dsn := fmt.Sprintf("host=%s port=%d dbname=%s user=%s password=%s sslmode=disable",
		c.Host, c.Port, c.Database, c.Username, c.Password)
	t.db, err = sql.Open("postgres", dsn)
	if err != nil {
		return nil, err
	}

	err = t.db.Ping()
	if err != nil {
		return nil, err
	}

	goose.SetBaseFS(embedded.Migrations)
	goose.SetDialect("postgres")
	goose.SetLogger(log)
	err = goose.Up(t.db, "migrations")
	if err != nil {
		return nil, err
	}

	return &t, nil
}

func (t *Postgres) wrapErr(err error) error {
	if err != nil && err == sql.ErrNoRows {
		return database.ErrNotFound
	}
	return err
}

// CreateInvite creates a new invite and its associated policy in a transaction.
func (p *Postgres) CreateInvite(invite models.Invite) error {
	tx, err := p.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Insert policy and retrieve its generated id.
	var policyID int
	err = tx.QueryRow(`
        INSERT INTO policies 
            (policy_name, is_administrator, is_disabled, enable_all_folders, enabled_folders, max_active_sessions, remote_client_bitrate_limit)
        VALUES 
            ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
    `, invite.Policy.PolicyName,
		invite.Policy.IsAdministrator,
		invite.Policy.IsDisabled,
		invite.Policy.EnableAllFolders,
		invite.Policy.EnabledFolders,
		invite.Policy.MaxActiveSessions,
		invite.Policy.RemoteClientBitrateLimit,
	).Scan(&policyID)
	if err != nil {
		return err
	}

	// Insert invite.
	_, err = tx.Exec(`
        INSERT INTO invites 
            (id, referrer, policy_id)
        VALUES 
            ($1, $2, $3)
    `, invite.ID, invite.Referrer, policyID)
	if err != nil {
		return err
	}

	return tx.Commit()
}

// GetInviteByID retrieves an invite by its ID using helper functions.
func (p *Postgres) GetInviteByID(id string) (models.Invite, error) {
	var invite models.Invite
	invite.ID = id

	referrer, err := pg_getValue[string](p, "invites", "referrer", "id", id)
	if err != nil {
		return invite, err
	}
	invite.Referrer = referrer

	policyID, err := pg_getValue[int](p, "invites", "policy_id", "id", id)
	if err != nil {
		return invite, err
	}

	var policy models.DehydratedPolicy

	name, err := pg_getValue[string](p, "policies", "policy_name", "id", policyID)
	if err != nil {
		return invite, err
	}
	policy.PolicyName = name

	admin, err := pg_getValue[bool](p, "policies", "is_administrator", "id", policyID)
	if err != nil {
		return invite, err
	}
	policy.IsAdministrator = &admin

	disabled, err := pg_getValue[bool](p, "policies", "is_disabled", "id", policyID)
	if err != nil {
		return invite, err
	}
	policy.IsDisabled = &disabled

	enableAll, err := pg_getValue[bool](p, "policies", "enable_all_folders", "id", policyID)
	if err != nil {
		return invite, err
	}
	policy.EnableAllFolders = &enableAll

	enabledFolders, err := pg_getValue[[]string](p, "policies", "enabled_folders", "id", policyID)
	if err != nil {
		return invite, err
	}
	policy.EnabledFolders = enabledFolders

	maxSessions, err := pg_getValue[int32](p, "policies", "max_active_sessions", "id", policyID)
	if err != nil {
		return invite, err
	}
	policy.MaxActiveSessions = &maxSessions

	bitrate, err := pg_getValue[int32](p, "policies", "remote_client_bitrate_limit", "id", policyID)
	if err != nil {
		return invite, err
	}
	policy.RemoteClientBitrateLimit = &bitrate

	invite.Policy = policy
	return invite, nil
}

// GetInviteByReferrer retrieves an invite using its referrer.
func (p *Postgres) GetInviteByReferrer(referrer string) (models.Invite, error) {
	var invite models.Invite

	// Retrieve invite id based on referrer.
	inviteID, err := pg_getValue[string](p, "invites", "id", "referrer", referrer)
	if err != nil {
		return invite, err
	}
	invite.ID = inviteID
	invite.Referrer = referrer

	policyID, err := pg_getValue[int](p, "invites", "policy_id", "id", inviteID)
	if err != nil {
		return invite, err
	}

	var policy models.DehydratedPolicy

	name, err := pg_getValue[string](p, "policies", "policy_name", "id", policyID)
	if err != nil {
		return invite, err
	}
	policy.PolicyName = name

	admin, err := pg_getValue[bool](p, "policies", "is_administrator", "id", policyID)
	if err != nil {
		return invite, err
	}
	policy.IsAdministrator = &admin

	disabled, err := pg_getValue[bool](p, "policies", "is_disabled", "id", policyID)
	if err != nil {
		return invite, err
	}
	policy.IsDisabled = &disabled

	enableAll, err := pg_getValue[bool](p, "policies", "enable_all_folders", "id", policyID)
	if err != nil {
		return invite, err
	}
	policy.EnableAllFolders = &enableAll

	enabledFolders, err := pg_getValue[[]string](p, "policies", "enabled_folders", "id", policyID)
	if err != nil {
		return invite, err
	}
	policy.EnabledFolders = enabledFolders

	maxSessions, err := pg_getValue[int32](p, "policies", "max_active_sessions", "id", policyID)
	if err != nil {
		return invite, err
	}
	policy.MaxActiveSessions = &maxSessions

	bitrate, err := pg_getValue[int32](p, "policies", "remote_client_bitrate_limit", "id", policyID)
	if err != nil {
		return invite, err
	}
	policy.RemoteClientBitrateLimit = &bitrate

	invite.Policy = policy
	return invite, nil
}

// DeleteInvite deletes an invite and, if no other invites reference the associated policy, deletes that policy.
func (p *Postgres) DeleteInvite(id string) error {
	// Retrieve policy id using helper.
	policyID, err := pg_getValue[int](p, "invites", "policy_id", "id", id)
	if err != nil {
		return err
	}

	// Delete the invite using helper.
	err = pg_delete(p, "invites", "id", id)
	if err != nil {
		return err
	}

	// Check whether any invites still reference the policy.
	var count int
	row := p.db.QueryRow(`SELECT COUNT(*) FROM invites WHERE policy_id = $1`, policyID)
	err = row.Scan(&count)
	if err != nil {
		return err
	}

	if count == 0 {
		err = pg_delete(p, "policies", "id", policyID)
		if err != nil {
			return err
		}
	}

	return nil
}

// Close closes the database connection.
func (p *Postgres) Close() error {
	return p.db.Close()
}

func pg_getValue[TVal, TWv any](t *Postgres, table, vk, wk string, wv TWv) (TVal, error) {
	var v TVal
	err := t.db.QueryRow(
		fmt.Sprintf(`SELECT "%s" FROM %s WHERE "%s" = $1`, vk, table, wk), wv).Scan(&v)
	return v, t.wrapErr(err)
}

func pg_setValue[TVal, TWv any](t *Postgres, table, vk string, val TVal, wk string, wv TWv) error {
	res, err := t.db.Exec(
		fmt.Sprintf(`UPDATE %s SET "%s" = $1 WHERE "%s" = $2`, table, vk, wk), val, wv)
	if err != nil {
		return err
	}

	ar, err := res.RowsAffected()
	if err != nil {
		return err
	}

	if ar == 0 {
		_, err = t.db.Exec(
			fmt.Sprintf(`INSERT INTO %s ("%s", "%s") VALUES ($1, $2)`, table, wk, vk), wv, val)
		if err == nil {
			return err
		}
	}

	return err
}

func pg_delete[TWv any](t *Postgres, table, wk string, wv TWv) error {
	_, err := t.db.Exec(fmt.Sprintf(`DELETE FROM %s WHERE "%s" = $1`, table, wk), wv)
	return t.wrapErr(err)
}
