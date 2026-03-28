import { createContext, useState, useEffect } from "react";
import axios from "axios";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {

    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchUser = async () => {
        try {
            const res = await axios.get("https://resumegap-ai.onrender.com/api/auth/get-me", {
                withCredentials: true
            });

            setUser(res.data.user);
        } catch (error) {
            setUser(null);
        } finally {
            setLoading(false);
        }
    };

    const logout = async () => {
        try {
            await axios.get("https://resumegap-ai.onrender.com/api/auth/logout", {
                withCredentials: true
            });

            setUser(null);
        } catch (error) {
            console.log(error);
        }
    };

    // ✅ Run on app load
    useEffect(() => {
        fetchUser();
    }, []);

    return (
        <AuthContext.Provider value={{
            user,
            setUser,
            loading,
            setLoading,
            logout,
            fetchUser
        }}>
            {children}
        </AuthContext.Provider>
    );
};