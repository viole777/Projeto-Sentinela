import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { PlaceholderPage } from './pages/PlaceholderPage';
export default function App(){return <Routes><Route path="/login" element={<Login/>}/><Route path="/primeiro-acesso" element={<Login mode="first"/>}/><Route path="/recuperar-senha" element={<Login mode="recover"/>}/><Route path="/app" element={<AppShell/>}><Route index element={<Navigate to="dashboard" replace/>}/><Route path="dashboard" element={<Dashboard/>}/>{['pacientes','triagem','consultas','farmacia','estoque','alertas','safety-engine','relatorios','configuracoes'].map(path=><Route key={path} path={path} element={<PlaceholderPage page={path}/>}/>)}</Route><Route path="*" element={<Navigate to="/login" replace/>}/></Routes>}