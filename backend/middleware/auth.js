function requireRole(roles) {
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    return (req, res, next) => {
        const role = req.header("x-user-role");
        const name = req.header("x-user-name") || "Unknown User";

        if (!role || !allowedRoles.includes(role)) {
            return res.status(403).json({ error: "You do not have permission for this action." });
        }

        req.user = { role, name };
        next();
    };
}

module.exports = { requireRole };
