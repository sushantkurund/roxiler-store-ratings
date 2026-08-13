# StoreRate

Full-stack, role-based store rating platform for the coding challenge.

## Run locally

1. Create a MySQL database named `store_ratings`.
2. Copy `.env.example` to `server/.env`, then add your MySQL credentials.
3. Run `npm run install:all`, then `npm run dev`.
4. Open `http://localhost:5173`.

The first start creates all tables and the administrator configured in `.env.example` (`admin@storeratings.local` / `Admin@123`).

## Included

React + Vite UI, Express + Sequelize API, MySQL schema, JWT auth, bcrypt hashing, role-protected customer/admin/owner workflows, sortable tables, filters, validation, and responsive UI.
