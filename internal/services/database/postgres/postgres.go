package postgres

import (
	"database/sql"
	"fmt"
	"time"

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

// Close closes the database connection.
func (p *Postgres) Close() error {
	return p.db.Close()
}

// Invites

// AddUpdateInvite inserts or updates an invite
func (p *Postgres) AddUpdateInvite(invite models.Invite) error {
	tx, err := p.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Insert or update invite with additional fields.
	_, err = tx.Exec(`
        INSERT INTO invites 
            (id, template_user_id, created_at, expires_at, use_limit, times_used)
        VALUES 
            ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET 
            template_user_id = EXCLUDED.template_user_id,
            created_at = EXCLUDED.created_at,
            expires_at = EXCLUDED.expires_at,
            use_limit = EXCLUDED.use_limit,
            times_used = EXCLUDED.times_used
    `, invite.ID, invite.TemplateUserID, invite.CreatedAt, invite.ExpiresAt, invite.UseLimit, invite.TimesUsed)
	if err != nil {
		return err
	}

	return tx.Commit()
}

// GetAllInvites retrieves all invites using helper functions.
func (p *Postgres) GetAllInvites() ([]models.Invite, error) {
	rows, err := p.db.Query(`SELECT id FROM invites`)
	if err != nil {
		return nil, err
	}

	var invites []models.Invite
	for rows.Next() {
		var id string
		err = rows.Scan(&id)
		if err != nil {
			return nil, err
		}
		invite, err := p.GetInviteByID(id)
		if err != nil {
			return nil, err
		}

		invites = append(invites, invite)
	}

	return invites, nil
}

// GetInviteByID retrieves an invite by its ID using helper functions.
func (p *Postgres) GetInviteByID(id string) (models.Invite, error) {
	var invite models.Invite
	invite.ID = id

	// Retrieve TemplateUserID.
	templateUserID, err := pg_getValue[string](p, "invites", "template_user_id", "id", id)
	if err != nil {
		return invite, err
	}
	invite.TemplateUserID = templateUserID

	// Retrieve new invite fields.
	createdAt, err := pg_getValue[time.Time](p, "invites", "created_at", "id", id)
	if err != nil {
		return invite, err
	}
	invite.CreatedAt = createdAt

	expiresAt, err := pg_getValue[time.Time](p, "invites", "expires_at", "id", id)
	if err != nil {
		return invite, err
	}
	invite.ExpiresAt = expiresAt

	useLimit, err := pg_getValue[int](p, "invites", "use_limit", "id", id)
	if err != nil {
		return invite, err
	}
	invite.UseLimit = useLimit

	timesUsed, err := pg_getValue[int](p, "invites", "times_used", "id", id)
	if err != nil {
		return invite, err
	}
	invite.TimesUsed = timesUsed

	return invite, nil
}

// DeleteInvite deletes an invite
func (p *Postgres) DeleteInvite(id string) error {
	return pg_delete(p, "invites", "id", id)
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
